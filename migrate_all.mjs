// ============================================================================
// migrate_all.mjs — consolidated migration runner
//
// Runs every one-off migration this project has accumulated, in dependency
// order, against the database configured in .env (DB_HOST / DB_USER /
// DB_PASSWORD / DB_NAME).
//
// Steps:
//   1. users:            add `status` column (account deactivation)
//   2. student_attendance: rekey (studentId, classId) -> enrollmentId
//   3. student_attendance: add `date` column + per-day uniqueness
//   4. student_attendance: add `quarter` column + index
//   5. student_attendance: rekey per-class -> per-subject (classSubjectId)
//   6. school_info:       add `principal` + `address` columns
//   7. grading_weight_defaults: create the single-row default-weights table
//   8. schoolyear + academic settings: add isActive flag; create academic_settings table
//   9. student_details:        create the 1:1 student additional-info table
//   10. student records:       per-quarter submission ledger table + decimal
//                              precision fix on the student_academic_record_subjects
//                              scaffold (q1..q4)
//   11. classrooms:            add `status` column (archive / soft-delete)
//   12. student_academic_record_subjects: freeze subject name/code snapshots
//                              (drop the subjectId FK so deleting a subject can
//                              never cascade into frozen grades)
//   13. enrollments:            add `status` column (enrolled/unenrolled/dropped)
//                              + simplify students.status to active/inactive only
//   14. enrollments:            add 'completed' to enrollment status enum
//
// Each step is idempotent: it inspects the current table layout first and
// skips itself when the change is already applied, so the file is safe to
// re-run on a partially or fully migrated database. On a fully migrated DB
// the whole run becomes a no-op.
//
// Backups: each step that mutates data backs the table up first
// (student_attendance_backup, _date_backup, _quarter_backup, _subject_backup).
// They are kept after the run — drop them once you are satisfied.
//
// Usage: from the server directory -> `npm run migrate`
//                                     (or `node migrate_all.mjs`)
// ============================================================================
import "dotenv/config";
import mysql from "mysql2/promise";

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 5,
});

const conn = await pool.getConnection();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function columnExists(table, column) {
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  return Number(rows[0].cnt) > 0;
}

async function keyExists(table, keyName) {
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS cnt FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [table, keyName]
  );
  return Number(rows[0].cnt) > 0;
}

// Foreign-key constraints live in KEY_COLUMN_USAGE, not STATISTICS — the index
// with the same name can outlive the constraint it backed, so keyExists() is
// the wrong probe for "does this FK exist".
async function fkExists(table, constraintName) {
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS cnt FROM information_schema.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ?
       AND REFERENCED_TABLE_NAME IS NOT NULL`,
    [table, constraintName]
  );
  return Number(rows[0].cnt) > 0;
}

async function tableColumns(table) {
  const [rows] = await conn.query(`SHOW COLUMNS FROM \`${table}\``);
  return rows.map((row) => row.Field);
}

// Drop every foreign key whose columns are in `columns` (e.g. old studentId/classId FKs).
async function dropForeignKeys(table, columns) {
  const placeholders = columns.map(() => "?").join(", ");
  const [fks] = await conn.query(
    `SELECT DISTINCT CONSTRAINT_NAME, COLUMN_NAME
     FROM information_schema.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND REFERENCED_TABLE_NAME IS NOT NULL
       AND COLUMN_NAME IN (${placeholders})`,
    [table, ...columns]
  );
  for (const fk of fks) {
    await conn.query(`ALTER TABLE \`${table}\` DROP FOREIGN KEY \`${fk.CONSTRAINT_NAME}\``);
    console.log(`  Dropped FK ${fk.CONSTRAINT_NAME} (${fk.COLUMN_NAME})`);
  }
  if (fks.length === 0) {
    console.log("  No old FKs found (already absent).");
  }
}

// Drop every index (except PRIMARY) that references a column in `columns`.
async function dropIndexes(table, columns) {
  const placeholders = columns.map(() => "?").join(", ");
  const [indexes] = await conn.query(
    `SELECT DISTINCT INDEX_NAME
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME IN (${placeholders})`,
    [table, ...columns]
  );
  for (const idx of indexes) {
    if (idx.INDEX_NAME === "PRIMARY") continue;
    await conn.query(`ALTER TABLE \`${table}\` DROP INDEX \`${idx.INDEX_NAME}\``);
    console.log(`  Dropped index ${idx.INDEX_NAME}`);
  }
  if (indexes.length === 0) {
    console.log("  No old indexes found (already absent).");
  }
}

async function step(name, fn) {
  console.log(`\n== ${name}`);
  await fn();
}

// ---------------------------------------------------------------------------
// Migration steps
// ---------------------------------------------------------------------------
try {
  console.log(`Target database: ${process.env.DB_NAME} @ ${process.env.DB_HOST}\n`);

  // ---- 1. users.status -----------------------------------------------------
  await step("1/5 — users: add `status` column", async () => {
    if (await columnExists("users", "status")) {
      console.log("  users.status already exists — skipping.");
      return;
    }

    await conn.query(
      "ALTER TABLE `users` ADD COLUMN `status` enum('active','inactive') NOT NULL DEFAULT 'active' AFTER `role`"
    );
    console.log("  Added users.status (default 'active').");

    // Backfill: students soft-deleted before this feature existed still have
    // active logins — deactivate them so the two states stay in sync.
    const [backfill] = await conn.query(
      "UPDATE users u JOIN students s ON s.userId = u.id SET u.status = 'inactive' WHERE s.status = 'inactive'"
    );
    console.log(`  Deactivated ${backfill.affectedRows} login(s) for soft-deleted students.`);
  });

  // ---- 2. attendance: rekey to enrollmentId --------------------------------
  await step("2/5 — student_attendance: rekey (studentId, classId) -> enrollmentId", async () => {
    const cols = await tableColumns("student_attendance");
    if (cols.includes("enrollmentId") && !cols.includes("studentId")) {
      console.log("  Already migrated (enrollmentId present, no studentId) — skipping.");
      return;
    }
    if (!cols.includes("studentId")) {
      throw new Error(
        "Unexpected layout — aborting. Expected the old studentId/classId layout to migrate."
      );
    }
    console.log("  Old layout confirmed (studentId/classId) — proceeding.");

    // 2a. Backup before any change
    await conn.query("DROP TABLE IF EXISTS `student_attendance_backup`");
    await conn.query("CREATE TABLE `student_attendance_backup` LIKE `student_attendance`");
    const [backup] = await conn.query(
      "INSERT INTO `student_attendance_backup` SELECT * FROM `student_attendance`"
    );
    console.log(`  Backed up ${backup.affectedRows} rows into student_attendance_backup.`);

    // 2b. Orphan check (attendance for never-enrolled students)
    const [orphans] = await conn.query(`
      SELECT COUNT(*) AS cnt
      FROM student_attendance sa
      WHERE NOT EXISTS (
        SELECT 1 FROM enrollments e
        WHERE e.studentId = sa.studentId AND e.classId = sa.classId
      )
    `);
    const orphanCount = Number(orphans[0].cnt);
    console.log(`  Orphan rows: ${orphanCount}`);
    if (orphanCount > 0) {
      throw new Error("ABORT: orphan attendance rows exist. Fix or purge them first, then re-run.");
    }

    // 2c. Add + backfill enrollmentId from (studentId, classId)
    await conn.query("ALTER TABLE `student_attendance` ADD COLUMN `enrollmentId` bigint(20) NULL AFTER `id`");
    const [matched] = await conn.query(`
      UPDATE student_attendance sa
      JOIN enrollments e ON e.studentId = sa.studentId AND e.classId = sa.classId
      SET sa.enrollmentId = e.id
    `);
    const [nulls] = await conn.query(
      "SELECT COUNT(*) AS cnt FROM student_attendance WHERE enrollmentId IS NULL"
    );
    console.log(`  Matched ${matched.affectedRows} rows; still NULL: ${Number(nulls[0].cnt)}`);
    if (Number(nulls[0].cnt) > 0) {
      throw new Error(
        "ABORT: some rows could not be backfilled. Restore from student_attendance_backup if needed."
      );
    }

    // 2d. Drop old FKs, indexes, then columns
    await dropForeignKeys("student_attendance", ["studentId", "classId"]);
    await dropIndexes("student_attendance", ["studentId", "classId"]);
    await conn.query("ALTER TABLE `student_attendance` DROP COLUMN `classId`");
    await conn.query("ALTER TABLE `student_attendance` DROP COLUMN `studentId`");

    // 2e. NOT NULL + new FK
    await conn.query("ALTER TABLE `student_attendance` MODIFY `enrollmentId` bigint(20) NOT NULL");
    await conn.query("ALTER TABLE `student_attendance` ADD KEY `fk_attendance_enrollment` (`enrollmentId`)");
    await conn.query(`
      ALTER TABLE \`student_attendance\`
        ADD CONSTRAINT \`fk_attendance_enrollment\` FOREIGN KEY (\`enrollmentId\`)
        REFERENCES \`enrollments\` (\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
    `);
    console.log("  Rekey complete (enrollmentId NOT NULL + FK fk_attendance_enrollment).");
  });

  // ---- 3. attendance: date column ------------------------------------------
  await step("3/5 — student_attendance: add `date` column + per-day uniqueness", async () => {
    if (await columnExists("student_attendance", "date")) {
      console.log("  student_attendance.date already exists — skipping.");
      return;
    }

    // 3a. Backup
    await conn.query("DROP TABLE IF EXISTS student_attendance_date_backup");
    await conn.query("CREATE TABLE student_attendance_date_backup LIKE student_attendance");
    await conn.query("INSERT INTO student_attendance_date_backup SELECT * FROM student_attendance");
    const [cnt] = await conn.query("SELECT COUNT(*) AS c FROM student_attendance");
    console.log(`  Backed up ${cnt[0].c} rows into student_attendance_date_backup`);

    // 3b. Add nullable date column
    await conn.query("ALTER TABLE student_attendance ADD COLUMN `date` date NULL AFTER `status`");

    // 3c. Backfill: assign dates by row order within each enrollment (newest row = today)
    const [updated] = await conn.query(`
      UPDATE student_attendance sa
      JOIN (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY enrollmentId ORDER BY id) AS rn
        FROM student_attendance
      ) x ON x.id = sa.id
      SET sa.date = DATE_SUB(CURDATE(), INTERVAL (x.rn - 1) DAY)
    `);
    console.log(`  Backfilled dates on ${updated.affectedRows} rows`);

    const [nulls] = await conn.query("SELECT COUNT(*) AS c FROM student_attendance WHERE date IS NULL");
    if (Number(nulls[0].c) > 0) {
      throw new Error(`ABORT: ${nulls[0].c} rows still have NULL date — fix manually before continuing.`);
    }

    // 3d. NOT NULL + unique per-day constraint
    await conn.query("ALTER TABLE student_attendance MODIFY `date` date NOT NULL");
    await conn.query("ALTER TABLE student_attendance ADD UNIQUE KEY `uq_attendance_once` (`enrollmentId`, `date`)");
    console.log("  date NOT NULL + UNIQUE uq_attendance_once (enrollmentId, date) added.");
  });

  // ---- 4. attendance: quarter column ---------------------------------------
  await step("4/5 — student_attendance: add `quarter` column + index", async () => {
    if (await columnExists("student_attendance", "quarter")) {
      console.log("  student_attendance.quarter already exists — skipping.");
      return;
    }

    // 4a. Backup
    await conn.query("DROP TABLE IF EXISTS student_attendance_quarter_backup");
    await conn.query("CREATE TABLE student_attendance_quarter_backup LIKE student_attendance");
    await conn.query("INSERT INTO student_attendance_quarter_backup SELECT * FROM student_attendance");
    const [cnt] = await conn.query("SELECT COUNT(*) AS c FROM student_attendance");
    console.log(`  Backed up ${cnt[0].c} rows into student_attendance_quarter_backup`);

    // 4b. Add nullable quarter column
    await conn.query("ALTER TABLE student_attendance ADD COLUMN `quarter` tinyint(4) NULL AFTER `status`");

    // 4c. Backfill quarter from the record's date (DepEd K-12 quarter split).
    //     Rows without a usable date default to quarter 1.
    const [updated] = await conn.query(`
      UPDATE student_attendance
      SET quarter = CASE
        WHEN MONTH(date) IN (6, 7, 8)   THEN 1
        WHEN MONTH(date) IN (9, 10, 11) THEN 2
        WHEN MONTH(date) IN (12, 1, 2)  THEN 3
        WHEN MONTH(date) IN (3, 4, 5)   THEN 4
        ELSE 1
      END
    `);
    console.log(`  Backfilled quarters on ${updated.affectedRows} rows`);

    // 4d. NOT NULL + index for quarter-filtered queries
    await conn.query("ALTER TABLE student_attendance MODIFY `quarter` tinyint(4) NOT NULL DEFAULT 1");
    await conn.query("ALTER TABLE student_attendance ADD KEY `idx_attendance_quarter` (`quarter`)");
    console.log("  quarter NOT NULL DEFAULT 1 + INDEX idx_attendance_quarter added.");
  });

  // ---- 5. attendance: rekey to per-subject ---------------------------------
  await step("5/5 — student_attendance: rekey per-class -> per-subject (classSubjectId)", async () => {
    if (await columnExists("student_attendance", "classSubjectId")) {
      console.log("  student_attendance.classSubjectId already exists — skipping.");
      return;
    }

    // 5a. Backup the old rows before clearing
    await conn.query("DROP TABLE IF EXISTS student_attendance_subject_backup");
    await conn.query("CREATE TABLE student_attendance_subject_backup LIKE student_attendance");
    await conn.query("INSERT INTO student_attendance_subject_backup SELECT * FROM student_attendance");
    const [cnt] = await conn.query("SELECT COUNT(*) AS c FROM student_attendance");
    console.log(`  Backed up ${cnt[0].c} rows into student_attendance_subject_backup`);

    // 5b. Clear existing rows (per-user decision: start fresh, re-seed afterwards)
    await conn.query("DELETE FROM student_attendance");
    console.log("  Cleared existing attendance rows (re-run `npm run seed` afterwards for demo data).");

    // 5c. Add the subject column
    await conn.query("ALTER TABLE student_attendance ADD COLUMN `classSubjectId` bigint(20) NULL AFTER `id`");

    // 5d. Swap the unique key: (enrollmentId, date) -> (classSubjectId, enrollmentId, date)
    if (await keyExists("student_attendance", "uq_attendance_once")) {
      await conn.query("ALTER TABLE student_attendance DROP INDEX `uq_attendance_once`");
      console.log("  Dropped old UNIQUE uq_attendance_once (enrollmentId, date)");
    }
    await conn.query("ALTER TABLE student_attendance MODIFY `classSubjectId` bigint(20) NOT NULL");
    await conn.query(
      "ALTER TABLE student_attendance ADD UNIQUE KEY `uq_attendance_once` (`classSubjectId`,`enrollmentId`,`date`)"
    );
    console.log("  Added UNIQUE uq_attendance_once (classSubjectId, enrollmentId, date)");

    // 5e. FK to class_subjects (cascade like the enrollment FK)
    await conn.query("ALTER TABLE student_attendance ADD KEY `fk_attendance_class_subject` (`classSubjectId`)");
    await conn.query(`
      ALTER TABLE \`student_attendance\`
        ADD CONSTRAINT \`fk_attendance_class_subject\` FOREIGN KEY (\`classSubjectId\`)
        REFERENCES \`class_subjects\` (\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
    `);
    console.log("  Added FK fk_attendance_class_subject -> class_subjects(id) CASCADE");
  });

  // ---- 6. school_info: principal + address columns ---------------------------
  await step("6/6 — school_info: add `principal` + `address` columns", async () => {
    const cols = await tableColumns("school_info");
    const added = [];

    if (!cols.includes("principal")) {
      await conn.query("ALTER TABLE `school_info` ADD COLUMN `principal` varchar(255) NULL AFTER `region`");
      added.push("principal");
    }
    if (!cols.includes("address")) {
      await conn.query("ALTER TABLE `school_info` ADD COLUMN `address` varchar(255) NULL AFTER `principal`");
      added.push("address");
    }

    if (added.length === 0) {
      console.log("  school_info.principal / address already exist — skipping.");
      return;
    }
    console.log(`  Added columns: ${added.join(", ")}`);
  });

  // ---- 7. grading_weight_defaults table -------------------------------------
  await step("7/7 — create `grading_weight_defaults` table (single-row default weights)", async () => {
    const [tables] = await conn.query(
      `SELECT COUNT(*) AS cnt FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
      ["grading_weight_defaults"]
    );
    if (Number(tables[0].cnt) > 0) {
      console.log("  grading_weight_defaults already exists — skipping.");
      return;
    }

    await conn.query(`
      CREATE TABLE \`grading_weight_defaults\` (
        \`id\` int(11) NOT NULL AUTO_INCREMENT,
        \`writtenWorkWeight\` decimal(5,2) NOT NULL DEFAULT 20.00,
        \`performanceTaskWeight\` decimal(5,2) NOT NULL DEFAULT 60.00,
        \`quarterlyAssessmentWeight\` decimal(5,2) NOT NULL DEFAULT 20.00,
        \`attendanceWeight\` decimal(5,2) NOT NULL DEFAULT 0.00,
        \`updated_at\` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`chk_default_weights_total\` CHECK (
          writtenWorkWeight + performanceTaskWeight + quarterlyAssessmentWeight + attendanceWeight <= 100
        )
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);
    await conn.query(
      "INSERT INTO grading_weight_defaults(writtenWorkWeight, performanceTaskWeight, quarterlyAssessmentWeight, attendanceWeight) VALUES(20.00, 60.00, 20.00, 0.00)"
    );
    console.log("  Created grading_weight_defaults + seeded 20/60/20/0 (DepEd DO 8 s. 2015).");
  });

  // ---- 8. schoolyear.isActive + academic_settings -----------------------------
  await step("8/8 — schoolyear: add `isActive` flag + create `academic_settings` table", async () => {
    // 8a. schoolyear.isActive (single active school year)
    if (!(await columnExists("schoolyear", "isActive"))) {
      await conn.query(
        "ALTER TABLE `schoolyear` ADD COLUMN `isActive` tinyint(1) NOT NULL DEFAULT 0 AFTER `endYear`"
      );
      // Mark the newest school year active so nothing breaks on first run.
      const [rows] = await conn.query(
        "SELECT id FROM schoolyear ORDER BY id DESC LIMIT 1"
      );
      if (rows.length > 0) {
        await conn.query(
          "UPDATE schoolyear SET isActive = (id = ?)",
          [Number(rows[0].id)]
        );
        console.log(`  Added schoolyear.isActive; activated newest year id=${rows[0].id}.`);
      } else {
        console.log("  Added schoolyear.isActive (no years to activate).");
      }
    } else {
      console.log("  schoolyear.isActive already exists — skipping.");
    }

    // 8b. academic_settings (single-row: current quarter + enrollment status)
    const [tables] = await conn.query(
      `SELECT COUNT(*) AS cnt FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
      ["academic_settings"]
    );
    if (Number(tables[0].cnt) > 0) {
      console.log("  academic_settings already exists — skipping.");
      return;
    }

    await conn.query(`
      CREATE TABLE \`academic_settings\` (
        \`id\` int(11) NOT NULL AUTO_INCREMENT,
        \`currentQuarter\` tinyint(1) NOT NULL DEFAULT 1,
        \`enrollmentOpen\` tinyint(1) NOT NULL DEFAULT 1,
        \`updated_at\` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`chk_current_quarter\` CHECK (currentQuarter BETWEEN 1 AND 4)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);
    await conn.query(
      "INSERT INTO academic_settings(currentQuarter, enrollmentOpen) VALUES(1, 1)"
    );
    console.log("  Created academic_settings + seeded (quarter 1, enrollment open).");
  });

  // ---- 9. student_details ------------------------------------------------------
  await step("9/9 — create `student_details` table (1:1 additional student info)", async () => {
    const [tables] = await conn.query(
      `SELECT COUNT(*) AS cnt FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
      ["student_details"]
    );
    if (Number(tables[0].cnt) > 0) {
      console.log("  student_details already exists — skipping.");
      return;
    }

    await conn.query(`
      CREATE TABLE \`student_details\` (
        \`id\` bigint(20) NOT NULL AUTO_INCREMENT,
        \`studentId\` bigint(20) NOT NULL,
        \`birthplace\` varchar(255) DEFAULT NULL,
        \`permanentAddress\` varchar(255) DEFAULT NULL,
        \`religion\` varchar(100) DEFAULT NULL,
        \`contactNumber\` varchar(30) DEFAULT NULL,
        \`guardianName\` varchar(255) DEFAULT NULL,
        \`guardianRelation\` varchar(50) DEFAULT NULL,
        \`guardianContact\` varchar(30) DEFAULT NULL,
        \`guardianOccupation\` varchar(100) DEFAULT NULL,
        \`created_at\` timestamp NOT NULL DEFAULT current_timestamp(),
        \`updated_at\` datetime DEFAULT NULL ON UPDATE current_timestamp(),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_student_details_student\` (\`studentId\`),
        CONSTRAINT \`fk_student_details_student\` FOREIGN KEY (\`studentId\`)
          REFERENCES \`students\` (\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);
    console.log("  Created student_details (1:1 additional student info).");
  });

  // ---- 10. student records ---------------------------------------------------
  await step("10/10 — student records: submission ledger + subject-row precision", async () => {
    // 10a. student_academic_record_subjects.q1..q4 -> decimal(5,2) NULL
    //      The scaffold table is unused so far, so this only touches empty rows.
    //      Fractional quarter grades (88.5) from computeQuarterGrade must survive
    //      the freeze; decimal(10,0) would round them to integers.
    const [q1Type] = await conn.query(
      `SELECT COLUMN_TYPE AS ct FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student_academic_record_subjects'
         AND COLUMN_NAME = 'q1'`
    );
    if (q1Type[0] && q1Type[0].ct !== "decimal(5,2)") {
      await conn.query(`
        ALTER TABLE \`student_academic_record_subjects\`
          MODIFY \`q1\` decimal(5,2) DEFAULT NULL,
          MODIFY \`q2\` decimal(5,2) DEFAULT NULL,
          MODIFY \`q3\` decimal(5,2) DEFAULT NULL,
          MODIFY \`q4\` decimal(5,2) DEFAULT NULL
      `);
      console.log("  student_academic_record_subjects.q1..q4 -> decimal(5,2) NULL.");
    } else {
      console.log("  student_academic_record_subjects.q1..q4 already decimal(5,2) — skipping.");
    }

    // 10b..10d only apply to the pre-decoupled schema. Once step 12 replaced the
    // subjectId FK with name/code snapshots, these three sub-steps must be
    // skipped — otherwise they would re-create the very subjectId column, unique
    // key, and CASCADE FK that step 12 removed.
    if (await columnExists("student_academic_record_subjects", "subjectName")) {
      console.log("  subject rows already decoupled from subjects (step 12) — skipping 10b/10c/10d.");
    } else {
      // 10b. The subjectId column must exist AND be int(11) to match subjects.id
      //      (InnoDB rejects FKs on mismatched types). The original scaffold table
      //      had no subject column at all (only id, recordId, q1..q4); the table
      //      is empty, so adding/modifying the column is safe.
      const [subjectIdCol] = await conn.query(
        `SELECT COLUMN_TYPE AS ct FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student_academic_record_subjects'
           AND COLUMN_NAME = 'subjectId'`
      );
      if (!subjectIdCol[0]) {
        await conn.query(
          "ALTER TABLE `student_academic_record_subjects` ADD COLUMN `subjectId` int(11) NOT NULL AFTER `recordId`"
        );
        console.log("  Added student_academic_record_subjects.subjectId (int(11) NOT NULL).");
      } else if (subjectIdCol[0].ct !== "int(11)") {
        await conn.query(
          "ALTER TABLE `student_academic_record_subjects` MODIFY `subjectId` int(11) NOT NULL"
        );
        console.log("  Modified subjectId -> int(11) NOT NULL.");
      } else {
        console.log("  student_academic_record_subjects.subjectId already int(11) — skipping.");
      }

      // 10c. Unique (recordId, subjectId) so freezing a grade is an idempotent upsert.
      if (!(await keyExists("student_academic_record_subjects", "uq_record_subject"))) {
        await conn.query(
          "ALTER TABLE `student_academic_record_subjects` ADD UNIQUE KEY `uq_record_subject` (`recordId`,`subjectId`)"
        );
        console.log("  Added UNIQUE uq_record_subject (recordId, subjectId).");
      } else {
        console.log("  uq_record_subject already exists — skipping.");
      }

      // 10d. FK subjectId -> subjects (cascade, matching the schema conventions).
      if (!(await keyExists("student_academic_record_subjects", "fk_record_subject_subject"))) {
        await conn.query(`
          ALTER TABLE \`student_academic_record_subjects\`
            ADD CONSTRAINT \`fk_record_subject_subject\` FOREIGN KEY (\`subjectId\`)
            REFERENCES \`subjects\` (\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
        `);
        console.log("  Added FK fk_record_subject_subject -> subjects(id) CASCADE.");
      } else {
        console.log("  fk_record_subject_subject already exists — skipping.");
      }
    }

    // 10e. student_academic_record_quarters — per (record, quarter) submission ledger.
    const [tables] = await conn.query(
      `SELECT COUNT(*) AS cnt FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
      ["student_academic_record_quarters"]
    );
    if (Number(tables[0].cnt) > 0) {
      console.log("  student_academic_record_quarters already exists — skipping.");
      return;
    }

    await conn.query(`
      CREATE TABLE \`student_academic_record_quarters\` (
        \`id\`          bigint(20) NOT NULL AUTO_INCREMENT,
        \`recordId\`    bigint(20) NOT NULL,
        \`quarter\`     tinyint(4) NOT NULL,
        \`status\`      enum('pending','submitted') NOT NULL DEFAULT 'pending',
        \`submittedAt\` datetime DEFAULT NULL,
        \`submittedBy\` bigint(20) DEFAULT NULL,
        \`created_at\`  timestamp NOT NULL DEFAULT current_timestamp(),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_record_quarter\` (\`recordId\`,\`quarter\`),
        KEY \`fk_record_quarter_submittedBy\` (\`submittedBy\`),
        CONSTRAINT \`fk_record_quarter_record\` FOREIGN KEY (\`recordId\`)
          REFERENCES \`student_academic_records\` (\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT \`fk_record_quarter_teacher\` FOREIGN KEY (\`submittedBy\`)
          REFERENCES \`teachers\` (\`id\`) ON DELETE SET NULL ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);
    console.log("  Created student_academic_record_quarters (per-quarter submission ledger).");
  });

  // ---- 11. classrooms.status (archive / soft-delete) --------------------------
  await step("11/12 — classrooms: add `status` column (archive / soft-delete)", async () => {
    if (await columnExists("classrooms", "status")) {
      console.log("  classrooms.status already exists — skipping.");
      return;
    }

    // Same enum convention as users.status / students.status. Existing rows are
    // active; archived classes are flipped to 'inactive' by the admin UI.
    await conn.query(
      "ALTER TABLE `classrooms` ADD COLUMN `status` enum('active','inactive') NOT NULL DEFAULT 'active' AFTER `gradeLevel`"
    );
    console.log("  Added classrooms.status (default 'active').");
  });

  // ---- 12. student_academic_record_subjects: name/code snapshot ----------------
  // The frozen record is a historical snapshot, so it must not depend on the
  // live `subjects` catalog. Replace the subjectId FK with subjectName /
  // subjectCode snapshots: deleting a subject can then never cascade into
  // frozen grades (fk_record_subject_subject was ON DELETE CASCADE).
  await step("12/12 — student records: freeze subject name/code snapshots (drop subjectId FK)", async () => {
    const hasSubjectId = await columnExists("student_academic_record_subjects", "subjectId");
    const hasSubjectName = await columnExists("student_academic_record_subjects", "subjectName");

    if (!hasSubjectId && hasSubjectName) {
      console.log("  subject name/code snapshot already applied — skipping.");
      return;
    }

    // 12a. Snapshot columns (nullable first; NOT NULL after the backfill).
    if (!hasSubjectName) {
      await conn.query(
        "ALTER TABLE `student_academic_record_subjects` ADD COLUMN `subjectName` varchar(50) DEFAULT NULL AFTER `recordId`"
      );
      console.log("  Added student_academic_record_subjects.subjectName (varchar(50)).");
    } else {
      console.log("  subjectName already exists — skipping.");
    }
    if (!(await columnExists("student_academic_record_subjects", "subjectCode"))) {
      await conn.query(
        "ALTER TABLE `student_academic_record_subjects` ADD COLUMN `subjectCode` varchar(50) DEFAULT NULL AFTER `subjectName`"
      );
      console.log("  Added student_academic_record_subjects.subjectCode (varchar(50)).");
    } else {
      console.log("  subjectCode already exists — skipping.");
    }

    // 12b. Backfill from the catalog. While the FK is in place every subjectId
    //      resolves, so the JOIN covers every row; the fallback self-heals any
    //      leftover NULL (e.g. from a partial run) instead of failing later.
    if (hasSubjectId) {
      await conn.query(`
        UPDATE student_academic_record_subjects sars
        JOIN subjects s ON s.id = sars.subjectId
        SET sars.subjectName = s.name, sars.subjectCode = s.code
      `);
      await conn.query(`
        UPDATE student_academic_record_subjects
        SET subjectName = CONCAT('Subject #', subjectId), subjectCode = ''
        WHERE subjectName IS NULL OR subjectName = ''
      `);
      console.log("  Backfilled subjectName/subjectCode from subjects.");
    }

    // 12c. Drop the FK so a subject delete can never cascade into frozen grades.
    if (await fkExists("student_academic_record_subjects", "fk_record_subject_subject")) {
      await conn.query(
        "ALTER TABLE `student_academic_record_subjects` DROP FOREIGN KEY `fk_record_subject_subject`"
      );
      console.log("  Dropped FK fk_record_subject_subject (subjectId -> subjects).");
    } else {
      console.log("  fk_record_subject_subject already dropped — skipping.");
    }

    // 12d. MySQL binds fk_recordId (recordId -> records) to the composite unique
    //      key uq_record_subject, so the key cannot be dropped while that FK
    //      stands. Drop fk_recordId first, drop the unique key + subjectId, then
    //      re-add fk_recordId so deleting a record still cascades into its grade
    //      rows.
    const hasFkRecordId = await fkExists("student_academic_record_subjects", "fk_recordId");
    if (hasFkRecordId) {
      await conn.query(
        "ALTER TABLE `student_academic_record_subjects` DROP FOREIGN KEY `fk_recordId`"
      );
      console.log("  Dropped FK fk_recordId (temporarily, to free uq_record_subject).");
    }

    if (await keyExists("student_academic_record_subjects", "uq_record_subject")) {
      await conn.query(
        "ALTER TABLE `student_academic_record_subjects` DROP KEY `uq_record_subject`"
      );
      console.log("  Dropped UNIQUE uq_record_subject (recordId, subjectId).");
    } else {
      console.log("  uq_record_subject already dropped — skipping.");
    }
    if (await columnExists("student_academic_record_subjects", "subjectId")) {
      await conn.query("ALTER TABLE `student_academic_record_subjects` DROP COLUMN `subjectId`");
      console.log("  Dropped subjectId column.");
    } else {
      console.log("  subjectId already dropped — skipping.");
    }

    // 12e. Unique (recordId, subjectName) keeps the quarter freeze an idempotent
    //      upsert now that the old (recordId, subjectId) key is gone.
    if (!(await keyExists("student_academic_record_subjects", "uq_record_subject_name"))) {
      await conn.query(
        "ALTER TABLE `student_academic_record_subjects` ADD UNIQUE KEY `uq_record_subject_name` (`recordId`,`subjectName`)"
      );
      console.log("  Added UNIQUE uq_record_subject_name (recordId, subjectName).");
    } else {
      console.log("  uq_record_subject_name already exists — skipping.");
    }

    // 12f. Restore the record-level cascade FK (dropped above to free the key).
    if (hasFkRecordId) {
      await conn.query(`
        ALTER TABLE \`student_academic_record_subjects\`
          ADD CONSTRAINT \`fk_recordId\` FOREIGN KEY (\`recordId\`)
          REFERENCES \`student_academic_records\` (\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
      `);
      console.log("  Re-added FK fk_recordId (recordId -> records CASCADE).");
    }

    // 12g. Snapshots are required once the backfill has populated every row.
    await conn.query(`
      ALTER TABLE \`student_academic_record_subjects\`
        MODIFY \`subjectName\` varchar(50) NOT NULL,
        MODIFY \`subjectCode\` varchar(50) NOT NULL
    `);
    console.log("  subjectName/subjectCode -> NOT NULL.");
  });

  // ---- 13. enrollment status + simplify student status -----------------------
  await step("13/13 — enrollment status + simplify students.status", async () => {
    // 13a. Check if enrollment.status column already exists
    if (await columnExists("enrollments", "status")) {
      console.log("  enrollments.status already exists — skipping.");
      return;
    }

    // 13b. Backfill: convert 'enrolled' and 'graduated' students to 'active'
    const [backfill] = await conn.query(
      "UPDATE students SET status = 'active' WHERE status IN ('enrolled', 'graduated')"
    );
    if (backfill.affectedRows > 0) {
      console.log(`  Converted ${backfill.affectedRows} student(s) from 'enrolled'/'graduated' to 'active'.`);
    }

    // 13c. Simplify students.status enum (remove 'enrolled' and 'graduated')
    const [statusCol] = await conn.query(
      `SELECT COLUMN_TYPE AS ct FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'students' AND COLUMN_NAME = 'status'`
    );
    if (statusCol[0] && statusCol[0].ct.includes("enrolled")) {
      await conn.query(
        "ALTER TABLE `students` MODIFY COLUMN `status` ENUM('active','inactive') DEFAULT NULL"
      );
      console.log("  Simplified students.status to ENUM('active','inactive').");
    } else {
      console.log("  students.status already simplified — skipping.");
    }

    // 13d. Add enrollments.status column
    await conn.query(
      "ALTER TABLE `enrollments` ADD COLUMN `status` ENUM('enrolled','unenrolled','dropped','completed') NOT NULL DEFAULT 'enrolled'"
    );
    console.log("  Added enrollments.status (ENUM, default 'enrolled').");

    // 13e. Ensure all existing enrollments are marked as 'enrolled'
    const [enrollUpdate] = await conn.query(
      "UPDATE enrollments SET status = 'enrolled' WHERE status IS NULL"
    );
    if (enrollUpdate.affectedRows > 0) {
      console.log(`  Set ${enrollUpdate.affectedRows} enrollment(s) to status 'enrolled'.`);
    }
  });

  // ---- 15. Add submissionsLocked to academic_settings -----------------------
  await step("15/15 — add `submissionsLocked` column to academic_settings", async () => {
    if (!(await columnExists("academic_settings", "submissionsLocked"))) {
      await conn.query(
        "ALTER TABLE `academic_settings` ADD COLUMN `submissionsLocked` tinyint(1) NOT NULL DEFAULT 0 AFTER `enrollmentOpen`"
      );
      console.log("  Added academic_settings.submissionsLocked.");
    } else {
      console.log("  academic_settings.submissionsLocked already exists — skipping.");
    }
  });

  // ---- 14. Add 'completed' to enrollment status enum --------------------------
  await step("14/14 — add 'completed' to enrollment status enum", async () => {
    const [statusCol] = await conn.query(
      `SELECT COLUMN_TYPE AS ct FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'enrollments' AND COLUMN_NAME = 'status'`
    );
    const colType = statusCol[0]?.ct || '';
    
    if (colType.includes('completed')) {
      console.log("  enrollments.status already includes 'completed' — skipping.");
      return;
    }
    
    // Add 'completed' to the enum
    await conn.query(
      "ALTER TABLE `enrollments` MODIFY COLUMN `status` ENUM('enrolled','unenrolled','dropped','completed') NOT NULL DEFAULT 'enrolled'"
    );
    console.log("  Added 'completed' to enrollments.status enum.");
  });

  // ---- Final verification ---------------------------------------------------
  await step("Final verification", async () => {
    const [attCols] = await conn.query("SHOW COLUMNS FROM `student_attendance`");
    console.log("  student_attendance columns:", attCols.map((c) => `${c.Field}:${c.Type}`).join(", "));

    const [userCols] = await conn.query("SHOW COLUMNS FROM `users`");
    console.log("  users columns:", userCols.map((c) => c.Field).join(", "));

    const [infoCols] = await conn.query("SHOW COLUMNS FROM `school_info`");
    console.log("  school_info columns:", infoCols.map((c) => `${c.Field}:${c.Type}`).join(", "));

    const [defCols] = await conn.query("SHOW COLUMNS FROM `grading_weight_defaults`");
    console.log("  grading_weight_defaults columns:", defCols.map((c) => `${c.Field}:${c.Type}`).join(", "));

    const [syCols] = await conn.query("SHOW COLUMNS FROM `schoolyear`");
    console.log("  schoolyear columns:", syCols.map((c) => `${c.Field}:${c.Type}`).join(", "));

    const [acCols] = await conn.query("SHOW COLUMNS FROM `academic_settings`");
    console.log("  academic_settings columns:", acCols.map((c) => `${c.Field}:${c.Type}`).join(", "));

    const [detCols] = await conn.query("SHOW COLUMNS FROM `student_details`");
    console.log("  student_details columns:", detCols.map((c) => `${c.Field}:${c.Type}`).join(", "));

    const [recCols] = await conn.query("SHOW COLUMNS FROM `student_academic_record_quarters`");
    console.log("  student_academic_record_quarters columns:", recCols.map((c) => `${c.Field}:${c.Type}`).join(", "));

    const [subjCols] = await conn.query("SHOW COLUMNS FROM `student_academic_record_subjects`");
    console.log("  student_academic_record_subjects columns:", subjCols.map((c) => `${c.Field}:${c.Type}`).join(", "));

    const [classCols] = await conn.query("SHOW COLUMNS FROM `classrooms`");
    console.log("  classrooms columns:", classCols.map((c) => `${c.Field}:${c.Type}`).join(", "));
  });

  console.log("\nALL MIGRATIONS COMPLETE.");
  console.log("Backup tables kept (drop once you are satisfied):");
  console.log("  - student_attendance_backup");
  console.log("  - student_attendance_date_backup");
  console.log("  - student_attendance_quarter_backup");
  console.log("  - student_attendance_subject_backup");
} catch (err) {
  console.error("\nMIGRATION FAILED:", err.message);
  console.error("Any backup tables listed above preserve the pre-migration data — restore from them if needed.");
  process.exitCode = 1;
} finally {
  conn.release();
  await pool.end();
}
