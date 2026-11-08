import dotenv from "dotenv";
dotenv.config();

import bcrypt from "bcrypt";
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getDBPoolConnection } from "./config/database.js";

import type { AssessmentType } from "./constant/assessment.js";

// Reused to freeze the demo submissions so the frozen grades match exactly what
// the faculty page computes (no hand-rolled constants to drift).
import { submitStudentRecordService } from "./service/studentRecord.js";

// Landing page content seed (docs/landing-content-plan.md Phase 2) —
// mirrors client/src/constant/landingContent.ts.
import { LANDING_CONTENT_SEED } from "./constant/landingSeed.js";
import { SAMPLE_STUDENTS } from "./constant/sampleStudents.js";

// Helper: coerce values to mysql-compatible array
function sql(...args: (string | number | boolean | null | undefined)[]): (string | number | boolean | null)[] {
  return args.map((v) => (v === undefined ? null : v));
}

// ────────────────────────────────────────────────────────────
// PDF Test Student & Multi-Year Academic History Configuration
// (Used for SF10 / Form 137 complete 4-year transcript testing)
// ────────────────────────────────────────────────────────────
export const PDF_TEST_STUDENT = {
  lrn: "123456789999",
  email: "pdf.test@student.edu",
  firstname: "PDF",
  middlename: "Test",
  lastname: "Student",
  suffix: null as string | null,
  birthdate: "2007-02-14",
  sex: "Male" as const,
  birthplace: "Manila",
  permanentAddress: "123 Rizal Ave, Santa Cruz, Manila",
  religion: "Roman Catholic",
  contactNumber: "0917-555-0199",
  guardianName: "Vicente Student",
  guardianRelation: "Father",
  guardianContact: "0917-555-0198",
  guardianOccupation: "Government Employee",
};

export const PDF_HISTORY_YEARS = [
  {
    startYear: "2019",
    endYear: "2020",
    section: "Section A - G7",
    gradeLevel: 7,
    adviserName: "Maria L. Santos",
    dateEnrolled: "2019-06-10",
    subjects: [
      { name: "Mathematics", code: "MATH101", q1: 90, q2: 92, q3: 88, q4: 94 },
      { name: "English", code: "ENG101", q1: 85, q2: 87, q3: 90, q4: 88 },
      { name: "Filipino", code: "FIL101", q1: 80, q2: 82, q3: 85, q4: 83 },
    ],
  },
  {
    startYear: "2020",
    endYear: "2021",
    section: "Section C - G8",
    gradeLevel: 8,
    adviserName: "Carlos R. Reyes",
    dateEnrolled: "2020-06-10",
    subjects: [
      { name: "Science", code: "SCI101", q1: 88, q2: 90, q3: 86, q4: 92 },
      { name: "English", code: "ENG101", q1: 91, q2: 93, q3: 89, q4: 95 },
      { name: "Filipino", code: "FIL101", q1: 72, q2: 74, q3: 71, q4: 73 }, // final < 75 -> Failed remarks
    ],
  },
  {
    startYear: "2021",
    endYear: "2022",
    section: "Section E - G9",
    gradeLevel: 9,
    adviserName: "Ana P. Gonzales",
    dateEnrolled: "2021-06-10",
    subjects: [
      { name: "Mathematics", code: "MATH101", q1: 95, q2: 93, q3: 97, q4: 96 },
      { name: "Araling Panlipunan", code: "AP101", q1: 86, q2: 88, q3: 90, q4: 87 },
      { name: "English", code: "ENG101", q1: 89, q2: 91, q3: 93, q4: 92 },
    ],
  },
  {
    startYear: "2022",
    endYear: "2023",
    section: "Section G - G10",
    gradeLevel: 10,
    adviserName: "Pedro S. Ramos",
    dateEnrolled: "2022-06-10",
    subjects: [
      { name: "Science", code: "SCI101", q1: 92, q2: 94, q3: 90, q4: 96 },
      { name: "Mathematics", code: "MATH101", q1: 88, q2: 85, q3: 90, q4: 87 },
      { name: "Filipino", code: "FIL101", q1: 78, q2: 80, q3: 82, q4: 79 },
    ],
  },
];

/**
 * Seed or update the 4-year academic history for the dedicated PDF test student.
 * Can run either inside an ongoing transaction or standalone.
 */
export async function seedPdfHistory(
  existingConn?: PoolConnection
): Promise<{ studentId: number; enrollmentsCount: number }> {
  const pool = getDBPoolConnection();
  const connection = existingConn ?? (await pool.getConnection());
  const ownsConnection = !existingConn;

  try {
    if (ownsConnection) {
      await connection.beginTransaction();
    }

    console.log("Seeding PDF test student & 4-year academic history for SF10...");
    const hash = await bcrypt.hash("password123", 10);

    // 1. Find or create the user account
    let userId: number;
    const [userRows] = await connection.execute<RowDataPacket[]>(
      "SELECT id FROM users WHERE email = ? LIMIT 1",
      [PDF_TEST_STUDENT.email]
    );
    if (userRows.length > 0) {
      userId = Number(userRows[0]!.id);
    } else {
      const [userRes] = await connection.execute<ResultSetHeader>(
        "INSERT INTO users(email, password, role, status) VALUES(?,?,?, 'active')",
        sql(PDF_TEST_STUDENT.email, hash, "student")
      );
      userId = userRes.insertId;
    }

    // 2. Find or create the student profile (with consolidated details)
    let studentId: number;
    const [studentRows] = await connection.execute<RowDataPacket[]>(
      "SELECT id FROM students WHERE email = ? OR lrn = ? LIMIT 1",
      [PDF_TEST_STUDENT.email, PDF_TEST_STUDENT.lrn]
    );
    if (studentRows.length > 0) {
      studentId = Number(studentRows[0]!.id);
      await connection.execute(
        `UPDATE students SET 
           userId = ?, status = 'active',
           birthplace = ?, permanentAddress = ?, religion = ?, contactNumber = ?,
           guardianName = ?, guardianRelation = ?, guardianContact = ?, guardianOccupation = ?
         WHERE id = ?`,
        sql(
          userId,
          PDF_TEST_STUDENT.birthplace,
          PDF_TEST_STUDENT.permanentAddress,
          PDF_TEST_STUDENT.religion,
          PDF_TEST_STUDENT.contactNumber,
          PDF_TEST_STUDENT.guardianName,
          PDF_TEST_STUDENT.guardianRelation,
          PDF_TEST_STUDENT.guardianContact,
          PDF_TEST_STUDENT.guardianOccupation,
          studentId
        )
      );
    } else {
      const [studentRes] = await connection.execute<ResultSetHeader>(
        `INSERT INTO students(
           userId, lrn, email, firstname, middlename, lastname, suffix, birthdate, sex, status,
           birthplace, permanentAddress, religion, contactNumber,
           guardianName, guardianRelation, guardianContact, guardianOccupation
         ) VALUES(?,?,?,?,?,?,?,?,?,'active',?,?,?,?,?,?,?,?)`,
        sql(
          userId,
          PDF_TEST_STUDENT.lrn,
          PDF_TEST_STUDENT.email,
          PDF_TEST_STUDENT.firstname,
          PDF_TEST_STUDENT.middlename,
          PDF_TEST_STUDENT.lastname,
          PDF_TEST_STUDENT.suffix,
          PDF_TEST_STUDENT.birthdate,
          PDF_TEST_STUDENT.sex,
          PDF_TEST_STUDENT.birthplace,
          PDF_TEST_STUDENT.permanentAddress,
          PDF_TEST_STUDENT.religion,
          PDF_TEST_STUDENT.contactNumber,
          PDF_TEST_STUDENT.guardianName,
          PDF_TEST_STUDENT.guardianRelation,
          PDF_TEST_STUDENT.guardianContact,
          PDF_TEST_STUDENT.guardianOccupation
        )
      );
      studentId = studentRes.insertId;
    }

    // 3. Seed the 4-year history
    let enrollmentsCount = 0;
    for (const year of PDF_HISTORY_YEARS) {
      // Find or create the school year
      let syId: number;
      const [syRows] = await connection.execute<RowDataPacket[]>(
        "SELECT id FROM schoolyear WHERE startYear = ? AND endYear = ? LIMIT 1",
        [year.startYear, year.endYear]
      );
      if (syRows.length > 0) {
        syId = Number(syRows[0]!.id);
      } else {
        const [syRes] = await connection.execute<ResultSetHeader>(
          "INSERT INTO schoolyear(startYear, endYear, isActive) VALUES(?,?,0)",
          [year.startYear, year.endYear]
        );
        syId = syRes.insertId;
      }

      // Find or create the classroom
      let classId: number;
      const [classRows] = await connection.execute<RowDataPacket[]>(
        "SELECT id FROM classrooms WHERE section = ? AND gradeLevel = ? LIMIT 1",
        [year.section, year.gradeLevel]
      );
      if (classRows.length > 0) {
        classId = Number(classRows[0]!.id);
      } else {
        const [classRes] = await connection.execute<ResultSetHeader>(
          "INSERT INTO classrooms(section, gradeLevel, status) VALUES(?,?,'active')",
          [year.section, year.gradeLevel]
        );
        classId = classRes.insertId;
      }

      // Remove any prior history for this student in this specific year
      const [oldEnrollments] = await connection.execute<RowDataPacket[]>(
        "SELECT id FROM enrollments WHERE studentId = ? AND schoolYearId = ?",
        [studentId, syId]
      );
      for (const row of oldEnrollments) {
        const oldId = Number(row.id);
        const [oldRecs] = await connection.execute<RowDataPacket[]>(
          "SELECT id FROM student_academic_records WHERE enrollmentId = ?",
          [oldId]
        );
        for (const r of oldRecs) {
          await connection.execute("DELETE FROM student_academic_record_quarters WHERE recordId = ?", [r.id]);
          await connection.execute("DELETE FROM student_academic_record_subjects WHERE recordId = ?", [r.id]);
        }
        await connection.execute("DELETE FROM student_academic_records WHERE enrollmentId = ?", [oldId]);
        await connection.execute("DELETE FROM enrollment_details WHERE enrollmentId = ?", [oldId]);
        await connection.execute("DELETE FROM enrollments WHERE id = ?", [oldId]);
      }

      // Insert enrollment
      const [enRes] = await connection.execute<ResultSetHeader>(
        "INSERT INTO enrollments(dateEnrolled, classId, schoolYearId, studentId, status) VALUES(?,?,?,?,'completed')",
        sql(year.dateEnrolled, classId, syId, studentId)
      );
      const enrollmentId = enRes.insertId;
      enrollmentsCount++;

      // Insert student academic record
      const [recRes] = await connection.execute<ResultSetHeader>(
        "INSERT INTO student_academic_records(enrollmentId, classSection, classGradeLevel, adviserName) VALUES(?,?,?,?)",
        sql(enrollmentId, year.section, year.gradeLevel, year.adviserName)
      );
      const recordId = recRes.insertId;

      // Insert subjects with grades
      for (const subj of year.subjects) {
        await connection.execute(
          `INSERT INTO student_academic_record_subjects(recordId, subjectName, subjectCode, q1, q2, q3, q4)
           VALUES(?,?,?,?,?,?,?)`,
          sql(recordId, subj.name, subj.code, subj.q1, subj.q2, subj.q3, subj.q4)
        );
      }

      // Mark all 4 quarters as submitted
      for (let q = 1; q <= 4; q++) {
        await connection.execute(
          `INSERT INTO student_academic_record_quarters(recordId, quarter, status, submittedAt)
           VALUES(?,?,'submitted',?)
           ON DUPLICATE KEY UPDATE status = 'submitted'`,
          sql(recordId, q, `${year.dateEnrolled.slice(0, 4)}-10-25 10:00:00`)
        );
      }
    }

    if (ownsConnection) {
      await connection.commit();
    }

    console.log(`  ✓ PDF test student initialized (studentId=${studentId}, LRN=${PDF_TEST_STUDENT.lrn})`);
    console.log(`  ✓ 4 complete academic years seeded (Grade 7 - 10, SF10 transcript ready)`);
    return { studentId, enrollmentsCount };
  } catch (err) {
    if (ownsConnection) {
      await connection.rollback();
    }
    console.error("Failed to seed PDF test history:", err);
    throw err;
  } finally {
    if (ownsConnection) {
      connection.release();
    }
  }
}

/**
 * Incrementally seed or update students only without clearing other system data.
 * Merges and modernizes the former seedStudents.ts functionality.
 */
export async function seedStudentsOnly(): Promise<{ totalProcessed: number; newlyAdded: number }> {
  const pool = getDBPoolConnection();
  const connection: PoolConnection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    console.log(`Starting seed of sample student data (dataset size: ${SAMPLE_STUDENTS.length})...`);

    // 1. Get or create active school year
    const [syRows] = await connection.execute<RowDataPacket[]>(
      "SELECT id FROM schoolyear WHERE isActive = 1 ORDER BY id DESC LIMIT 1"
    );
    let activeSyId: number;
    if (syRows.length === 0) {
      console.log("No active school year found. Creating default 2024-2025 school year...");
      const [syRes] = await connection.execute<ResultSetHeader>(
        "INSERT INTO schoolyear(startYear, endYear, isActive) VALUES('2024','2025',1)"
      );
      activeSyId = syRes.insertId;
    } else {
      activeSyId = Number(syRows[0]!.id);
    }

    // 2. Fetch existing classrooms
    const [classroomRows] = await connection.execute<RowDataPacket[]>(
      "SELECT id, section, gradeLevel FROM classrooms ORDER BY gradeLevel ASC, section ASC"
    );
    let classrooms = classroomRows.map((r) => ({
      id: Number(r.id),
      section: String(r.section),
      gradeLevel: Number(r.gradeLevel),
    }));

    // If no classrooms exist, seed basic Grade 7 - 11 classrooms
    if (classrooms.length === 0) {
      console.log("No classrooms found. Creating default classrooms...");
      const defaultClassrooms = [
        { section: "Section A - G7", gradeLevel: 7 },
        { section: "Section B - G7", gradeLevel: 7 },
        { section: "Section C - G8", gradeLevel: 8 },
        { section: "Section D - G8", gradeLevel: 8 },
        { section: "Section E - G9", gradeLevel: 9 },
        { section: "Section F - G9", gradeLevel: 9 },
        { section: "Section G - G10", gradeLevel: 10 },
        { section: "Section H - G10", gradeLevel: 10 },
        { section: "Section I - G11", gradeLevel: 11 },
        { section: "Section J - G11", gradeLevel: 11 },
      ];
      classrooms = [];
      for (const dc of defaultClassrooms) {
        const [cRes] = await connection.execute<ResultSetHeader>(
          "INSERT INTO classrooms(section, gradeLevel, status) VALUES(?,?,'active')",
          sql(dc.section, dc.gradeLevel)
        );
        classrooms.push({ id: cRes.insertId, section: dc.section, gradeLevel: dc.gradeLevel });
      }
    }

    // 3. Fetch advisers per classroom (via classrooms.adviserFacultyId)
    const [adviserRows] = await connection.execute<RowDataPacket[]>(`
      SELECT c.id AS classId, f.firstname, f.middlename, f.lastname, f.suffix
      FROM classrooms c
      JOIN faculties f ON f.id = c.adviserFacultyId
    `);
    const adviserMap = new Map<number, string>();
    for (const row of adviserRows) {
      const name = `${row.firstname} ${row.middlename} ${row.lastname}${row.suffix ? " " + row.suffix : ""}`;
      adviserMap.set(Number(row.classId), name);
    }

    // 4. Fetch available subjects
    const [subjectRows] = await connection.execute<RowDataPacket[]>("SELECT id FROM subjects LIMIT 5");
    const subjectIds = subjectRows.map((r) => Number(r.id));

    // 5. Pre-hash password once for fast bulk insertion
    const defaultHash = await bcrypt.hash("password123", 10);
    let newlyAdded = 0;

    for (let i = 0; i < SAMPLE_STUDENTS.length; i++) {
      const s = SAMPLE_STUDENTS[i]!;

      // Check if user already exists
      const [userRows] = await connection.execute<RowDataPacket[]>(
        "SELECT id FROM users WHERE email = ? LIMIT 1",
        [s.email]
      );
      let userId: number;
      if (userRows.length > 0) {
        userId = Number(userRows[0]!.id);
      } else {
        const [uRes] = await connection.execute<ResultSetHeader>(
          "INSERT INTO users(email, password, role, status) VALUES(?,?,?,?)",
          sql(s.email, defaultHash, "student", "active")
        );
        userId = uRes.insertId;
      }

      // Check if student already exists by LRN or email
      const [studentRows] = await connection.execute<RowDataPacket[]>(
        "SELECT id FROM students WHERE lrn = ? OR email = ? LIMIT 1",
        [s.lrn, s.email]
      );
      let studentId: number;
      if (studentRows.length > 0) {
        studentId = Number(studentRows[0]!.id);
        await connection.execute(
          `UPDATE students SET
             userId = ?, status = 'active',
             birthplace = ?, permanentAddress = ?, religion = ?, contactNumber = ?,
             guardianName = ?, guardianRelation = ?, guardianContact = ?, guardianOccupation = ?
           WHERE id = ?`,
          sql(
            userId,
            s.birthplace,
            s.permanentAddress,
            s.religion,
            s.contactNumber,
            s.guardianName,
            s.guardianRelation,
            s.guardianContact,
            s.guardianOccupation,
            studentId
          )
        );
      } else {
        const [stRes] = await connection.execute<ResultSetHeader>(
          `INSERT INTO students(
             userId, lrn, email, firstname, middlename, lastname, suffix, birthdate, sex, status,
             birthplace, permanentAddress, religion, contactNumber,
             guardianName, guardianRelation, guardianContact, guardianOccupation
           ) VALUES(?,?,?,?,?,?,?,?,?,'active',?,?,?,?,?,?,?,?)`,
          sql(
            userId,
            s.lrn,
            s.email,
            s.firstname,
            s.middlename,
            s.lastname,
            s.suffix,
            s.birthdate,
            s.sex,
            s.birthplace,
            s.permanentAddress,
            s.religion,
            s.contactNumber,
            s.guardianName,
            s.guardianRelation,
            s.guardianContact,
            s.guardianOccupation
          )
        );
        studentId = stRes.insertId;
        newlyAdded++;
      }

      // Distribute student into classrooms
      const classIdx = i < 10 ? i % Math.min(5, classrooms.length) : (i - 10) % classrooms.length;
      const targetClassroom = classrooms[classIdx]!;

      // Check existing enrollment in active school year
      const [enrollRows] = await connection.execute<RowDataPacket[]>(
        "SELECT id, classId FROM enrollments WHERE studentId = ? AND schoolYearId = ? LIMIT 1",
        [studentId, activeSyId]
      );

      let enrollmentId: number;
      if (enrollRows.length > 0) {
        enrollmentId = Number(enrollRows[0]!.id);
      } else {
        const [enRes] = await connection.execute<ResultSetHeader>(
          "INSERT INTO enrollments(dateEnrolled, classId, schoolYearId, studentId, status) VALUES(CURDATE(),?,?,?, 'enrolled')",
          sql(targetClassroom.id, activeSyId, studentId)
        );
        enrollmentId = enRes.insertId;

        // Link subjects to enrollment_details (first 2 subjects if available)
        for (let si = 0; si < Math.min(2, subjectIds.length); si++) {
          await connection.execute(
            "INSERT IGNORE INTO enrollment_details(enrollmentId, subjectId) VALUES(?,?)",
            sql(enrollmentId, subjectIds[si]!)
          );
        }

        // Link student_academic_records
        const adviser = adviserMap.get(targetClassroom.id) || "Adviser";
        await connection.execute(
          "INSERT IGNORE INTO student_academic_records(enrollmentId, classSection, classGradeLevel, adviserName) VALUES(?,?,?,?)",
          sql(enrollmentId, targetClassroom.section, targetClassroom.gradeLevel, adviser)
        );
      }
    }

    await connection.commit();

    console.log("\n==========================================");
    console.log("  STUDENT SEED COMPLETE!");
    console.log("==========================================");
    console.log(`  Total sample students: ${SAMPLE_STUDENTS.length}`);
    console.log(`  Newly added students:  ${newlyAdded}`);
    console.log(`  All accounts login:    password123`);
    console.log("==========================================\n");

    return { totalProcessed: SAMPLE_STUDENTS.length, newlyAdded };
  } catch (err) {
    await connection.rollback();
    console.error("Student seed failed, rolled back:", err);
    throw err;
  } finally {
    connection.release();
  }
}

/**
 * Primary Master Seed Function.
 * Clears database and performs a fresh, synchronized seed of all models,
 * reference tables, sample accounts, test fixtures, and demo submissions.
 */
export async function seed(): Promise<void> {
  const pool = getDBPoolConnection();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // ──────────────────────────────────────────────────────
    // 1. Clear existing data (reverse dependency order)
    // ──────────────────────────────────────────────────────
    console.log("Clearing existing data...");
    // Audits & amendment requests (reference users, enrollments, class_subjects)
    await connection.execute("DELETE FROM amendment_audit_logs");
    await connection.execute("DELETE FROM amendment_permissions");
    await connection.execute("DELETE FROM amendment_requests");
    await connection.execute("DELETE FROM activity_audit_logs");

    // Academic submissions and records (reference enrollments, faculties, subjects)
    await connection.execute("DELETE FROM class_subject_submissions");
    await connection.execute("DELETE FROM student_academic_record_quarters");
    await connection.execute("DELETE FROM student_academic_record_subjects");
    await connection.execute("DELETE FROM student_academic_records");
    await connection.execute("DELETE FROM student_scores");
    await connection.execute("DELETE FROM student_attendance");
    await connection.execute("DELETE FROM class_daily_attendance");
    await connection.execute("DELETE FROM assessments");
    await connection.execute("DELETE FROM grading_weights");
    await connection.execute("DELETE FROM student_academic_record_components");
    await connection.execute("DELETE FROM subject_components");
    await connection.execute("DELETE FROM class_subjects");
    await connection.execute("DELETE FROM enrollment_details");
    await connection.execute("DELETE FROM enrollments");

    // Structure & assignments
    await connection.execute("UPDATE classrooms SET adviserFacultyId = NULL");
    await connection.execute("DELETE FROM faculty_subject_assignment");
    await connection.execute("DELETE FROM classrooms");
    await connection.execute("DELETE FROM subjects");

    // Persons & login accounts
    await connection.execute("DELETE FROM students");
    await connection.execute("DELETE FROM faculties");
    await connection.execute("DELETE FROM users");

    // Academic calendar & school info
    await connection.execute("DELETE FROM academic_settings");
    await connection.execute("DELETE FROM schoolyear");
    await connection.execute("DELETE FROM school_info");

    // ──────────────────────────────────────────────────────
    // 2. Users (1 admin + 1 developer + 1 register + 10 faculties + sample students)
    // ──────────────────────────────────────────────────────
    console.log("Seeding users...");
    const hash = await bcrypt.hash("password123", 10);

    await connection.execute(
      "INSERT INTO users(email, password, role) VALUES(?,?,?)",
      sql("admin@gradesync.edu", hash, "admin")
    );

    await connection.execute(
      "INSERT INTO users(email, password, role) VALUES(?,?,?)",
      sql("dev@gradesync.edu", hash, "developer")
    );

    const [registerUserResult] = await connection.execute<ResultSetHeader>(
      "INSERT INTO users(email, password, role) VALUES(?,?,?)",
      sql("register@gradesync.edu", hash, "teacher")
    );
    const registerUserId = registerUserResult.insertId;

    const facultyEmails: string[] = [
      "juan.delacruz@gradesync.edu",
      "maria.santos@gradesync.edu",
      "carlos.reyes@gradesync.edu",
      "ana.gonzales@gradesync.edu",
      "pedro.ramos@gradesync.edu",
      "luz.villanueva@gradesync.edu",
      "miguel.angeles@gradesync.edu",
      "rosa.lopez@gradesync.edu",
      "antonio.flores@gradesync.edu",
      "elena.garcia@gradesync.edu",
    ];
    const facultyUserIds: number[] = [];
    for (const email of facultyEmails) {
      const [result] = await connection.execute<ResultSetHeader>(
        "INSERT INTO users(email, password, role) VALUES(?,?,?)",
        sql(email, hash, "teacher")
      );
      facultyUserIds.push(result.insertId);
    }

    const studentUserIds: number[] = [];
    for (const student of SAMPLE_STUDENTS) {
      const [result] = await connection.execute<ResultSetHeader>(
        "INSERT INTO users(email, password, role, status) VALUES(?,?,?, 'active')",
        sql(student.email, hash, "student")
      );
      studentUserIds.push(result.insertId);
    }

    // ──────────────────────────────────────────────────────
    // 3. Faculties (10 teachers + 1 register)
    // ──────────────────────────────────────────────────────
    console.log("Seeding faculties...");
    const facultyData = [
      { firstname: "Juan", middlename: "M.", lastname: "Dela Cruz", suffix: null, gender: "Male" },
      { firstname: "Maria", middlename: "L.", lastname: "Santos", suffix: null, gender: "Female" },
      { firstname: "Carlos", middlename: "R.", lastname: "Reyes", suffix: "Jr.", gender: "Male" },
      { firstname: "Ana", middlename: "P.", lastname: "Gonzales", suffix: null, gender: "Female" },
      { firstname: "Pedro", middlename: "S.", lastname: "Ramos", suffix: null, gender: "Male" },
      { firstname: "Luz", middlename: "T.", lastname: "Villanueva", suffix: null, gender: "Female" },
      { firstname: "Miguel", middlename: "D.", lastname: "Angeles", suffix: "III", gender: "Male" },
      { firstname: "Rosa", middlename: "C.", lastname: "Lopez", suffix: null, gender: "Female" },
      { firstname: "Antonio", middlename: "B.", lastname: "Flores", suffix: null, gender: "Male" },
      { firstname: "Elena", middlename: "G.", lastname: "Garcia", suffix: null, gender: "Female" },
    ];
    const facultyIds: number[] = [];
    for (let i = 0; i < facultyData.length; i++) {
      const t = facultyData[i]!;
      const [result] = await connection.execute<ResultSetHeader>(
        "INSERT INTO faculties(email, firstname, middlename, lastname, suffix, gender, role, userId) VALUES(?,?,?,?,?,?,?,?)",
        sql(facultyEmails[i]!, t.firstname, t.middlename, t.lastname, t.suffix, t.gender, "teacher", facultyUserIds[i]!)
      );
      facultyIds.push(result.insertId);
    }

    await connection.execute<ResultSetHeader>(
      "INSERT INTO faculties(email, firstname, middlename, lastname, suffix, gender, role, userId) VALUES(?,?,?,?,?,?,?,?)",
      sql("register@gradesync.edu", "Rosario", "M.", "Dizon", null, "Female", "register", registerUserId)
    );

    // ──────────────────────────────────────────────────────
    // 4. Students (${SAMPLE_STUDENTS.length}) with consolidated personal/guardian fields
    // ──────────────────────────────────────────────────────
    console.log(`Seeding students (${SAMPLE_STUDENTS.length})...`);
    const studentIds: number[] = [];
    for (let i = 0; i < SAMPLE_STUDENTS.length; i++) {
      const s = SAMPLE_STUDENTS[i]!;
      const [result] = await connection.execute<ResultSetHeader>(
        `INSERT INTO students(
           userId, lrn, email, firstname, middlename, lastname, suffix, birthdate, sex, status,
           birthplace, permanentAddress, religion, contactNumber,
           guardianName, guardianRelation, guardianContact, guardianOccupation
         ) VALUES(?,?,?,?,?,?,?,?,?,'active',?,?,?,?,?,?,?,?)`,
        sql(
          studentUserIds[i]!,
          s.lrn,
          s.email,
          s.firstname,
          s.middlename,
          s.lastname,
          s.suffix,
          s.birthdate,
          s.sex,
          s.birthplace,
          s.permanentAddress,
          s.religion,
          s.contactNumber,
          s.guardianName,
          s.guardianRelation,
          s.guardianContact,
          s.guardianOccupation
        )
      );
      studentIds.push(result.insertId);
    }

    // ──────────────────────────────────────────────────────
    // 5. Subjects & Components
    // ──────────────────────────────────────────────────────
    console.log("Seeding subjects...");
    const subjectData = [
      { name: "Mathematics", code: "MATH101", unit: 3, hasComponents: false },
      { name: "English", code: "ENG101", unit: 3, hasComponents: false },
      { name: "Science", code: "SCI101", unit: 3, hasComponents: false },
      { name: "Filipino", code: "FIL101", unit: 3, hasComponents: false },
      { name: "Araling Panlipunan", code: "AP101", unit: 2, hasComponents: false },
      { name: "Values Education", code: "VAL101", unit: 2, hasComponents: false },
      { name: "MAPEH", code: "MAPEH101", unit: 2, hasComponents: true },
      { name: "Technology and Livelihood Education", code: "TLE101", unit: 2, hasComponents: false },
      { name: "Computer Science", code: "CS101", unit: 3, hasComponents: false },
      { name: "Science 2 - Chemistry", code: "SCI201", unit: 3, hasComponents: false },
      { name: "Mathematics 2 - Algebra", code: "MATH201", unit: 3, hasComponents: false },
      { name: "English 2 - Literature", code: "ENG201", unit: 3, hasComponents: false },
    ];
    const subjectIds: number[] = [];
    for (const subj of subjectData) {
      const [result] = await connection.execute<ResultSetHeader>(
        "INSERT INTO subjects(name, code, unit, hasComponents) VALUES(?,?,?,?)",
        sql(subj.name, subj.code, subj.unit, subj.hasComponents ? 1 : 0)
      );
      subjectIds.push(result.insertId);
    }

    console.log("Seeding MAPEH components...");
    const mapehSubjectId = subjectIds[6]!;
    const mapehComponents = [
      { name: "Music", code: "MAPEH-M", weight: 25 },
      { name: "Arts", code: "MAPEH-A", weight: 25 },
      { name: "Physical Education", code: "MAPEH-PE", weight: 25 },
      { name: "Health", code: "MAPEH-H", weight: 25 },
    ];
    for (const comp of mapehComponents) {
      await connection.execute(
        "INSERT INTO subject_components(parentSubjectId, name, code, weight) VALUES(?,?,?,?)",
        sql(mapehSubjectId, comp.name, comp.code, comp.weight)
      );
    }

    // ──────────────────────────────────────────────────────
    // 6. Classrooms (10)
    // ──────────────────────────────────────────────────────
    console.log("Seeding classrooms...");
    const classroomData = [
      { section: "Section A - G7", gradeLevel: 7 },
      { section: "Section B - G7", gradeLevel: 7 },
      { section: "Section C - G8", gradeLevel: 8 },
      { section: "Section D - G8", gradeLevel: 8 },
      { section: "Section E - G9", gradeLevel: 9 },
      { section: "Section F - G9", gradeLevel: 9 },
      { section: "Section G - G10", gradeLevel: 10 },
      { section: "Section H - G10", gradeLevel: 10 },
      { section: "Section I - G11", gradeLevel: 11 },
      { section: "Section J - G11", gradeLevel: 11 },
    ];
    const classroomIds: number[] = [];
    for (const c of classroomData) {
      const [result] = await connection.execute<ResultSetHeader>(
        "INSERT INTO classrooms(section, gradeLevel) VALUES(?,?)",
        sql(c.section, c.gradeLevel)
      );
      classroomIds.push(result.insertId);
    }

    // ──────────────────────────────────────────────────────
    // 7. School Years (12)
    // ──────────────────────────────────────────────────────
    console.log("Seeding schoolyear...");
    const schoolYearData = [
      "2015-2016", "2016-2017", "2017-2018", "2018-2019", "2019-2020",
      "2020-2021", "2021-2022", "2022-2023", "2023-2024", "2024-2025",
      "2025-2026", "2026-2027",
    ];
    const schoolYearIds: number[] = [];
    for (let i = 0; i < schoolYearData.length; i++) {
      const sy = schoolYearData[i]!;
      const parts = sy.split("-");
      const [result] = await connection.execute<ResultSetHeader>(
        "INSERT INTO schoolyear(startYear, endYear, isActive) VALUES(?,?,?)",
        sql(parts[0], parts[1], i === schoolYearData.length - 1 ? 1 : 0)
      );
      schoolYearIds.push(result.insertId);
    }

    // ──────────────────────────────────────────────────────
    // 8. Assign classroom advisers via classrooms.adviserFacultyId
    // ──────────────────────────────────────────────────────
    console.log("Setting classroom advisers...");
    for (let i = 0; i < Math.min(facultyIds.length, classroomIds.length); i++) {
      await connection.execute(
        "UPDATE classrooms SET adviserFacultyId = ? WHERE id = ?",
        sql(facultyIds[i]!, classroomIds[i]!)
      );
    }

    // ──────────────────────────────────────────────────────
    // 9. Faculty Subject Assignments (TSA)
    // ──────────────────────────────────────────────────────
    console.log("Seeding faculty_subject_assignment...");
    const tsaPlan: [number, number[]][] = [
      [0, [0, 1]],   // Math → Juan, Maria
      [1, [1, 2]],   // English → Maria, Carlos
      [2, [3]],      // Science → Ana
      [3, [4]],      // Filipino → Pedro
      [4, [5]],      // AP → Luz
      [5, [6]],      // Values → Miguel
      [6, [7]],      // MAPEH → Rosa
      [7, [8]],      // TLE → Antonio
      [8, [9, 0]],   // CS → Elena, Juan
      [9, [3]],      // Chemistry → Ana
      [10, [0]],     // Algebra → Juan
      [11, [2]],     // Literature → Carlos
    ];
    const tsaIds: number[][] = subjectIds.map(() => []);
    for (const [subjIdx, facultyIdxs] of tsaPlan) {
      for (const teachIdx of facultyIdxs) {
        const [result] = await connection.execute<ResultSetHeader>(
          "INSERT INTO faculty_subject_assignment(facultyId, subjectId) VALUES(?,?)",
          sql(facultyIds[teachIdx]!, subjectIds[subjIdx]!)
        );
        const list = tsaIds[subjIdx];
        if (list) list.push(result.insertId);
      }
    }

    // ──────────────────────────────────────────────────────
    // 10. Enrollments for active school year
    // ──────────────────────────────────────────────────────
    console.log("Seeding enrollments...");
    function getStudentClassroomIndex(index: number, totalClassrooms: number): number {
      if (index < 10) {
        return index % 5;
      }
      return (index - 10) % totalClassrooms;
    }

    const enrollmentIds: number[] = [];
    const activeSchoolYearId = schoolYearIds[schoolYearIds.length - 1]!;
    for (let i = 0; i < studentIds.length; i++) {
      const ci = getStudentClassroomIndex(i, classroomIds.length);
      const [result] = await connection.execute<ResultSetHeader>(
        "INSERT INTO enrollments(dateEnrolled, classId, schoolYearId, studentId, status) VALUES(CURDATE(),?,?,?, 'enrolled')",
        sql(classroomIds[ci]!, activeSchoolYearId, studentIds[i]!)
      );
      enrollmentIds.push(result.insertId);
    }

    // ──────────────────────────────────────────────────────
    // 11. Class Subjects
    // ──────────────────────────────────────────────────────
    console.log("Seeding class_subjects...");
    const subjectFaculties: number[][] = subjectIds.map(() => []);
    for (const [subjIdx, facultyIdxs] of tsaPlan) {
      const list = subjectFaculties[subjIdx];
      if (list) {
        for (const teachIdx of facultyIdxs) {
          list.push(facultyIds[teachIdx]!);
        }
      }
    }
    const usedPairs = new Set<string>();
    const csPlan: [number, number[]][] = [
      [0, [0, 1, 2, 3, 4]],    // Room A → Math, Eng, Sci, Fil, AP
      [1, [0, 1, 5, 6, 7]],    // Room B → Math, Eng, Values, MAPEH, TLE
      [2, [2, 3, 8, 9, 10]],   // Room C → Sci, Fil, CS, Chem, Algebra
      [3, [4, 5, 6, 7, 11]],   // Room D → AP, Values, MAPEH, TLE, Literature
      [4, [0, 1, 8, 9, 10]],   // Room E → Math, Eng, CS, Chem, Algebra
      [5, [2, 3, 4, 5, 6]],    // Room F → Sci, Fil, AP, Values, MAPEH
      [6, [7, 8, 9, 10, 11]],  // Room G → TLE, CS, Chem, Algebra, Literature
      [7, [0, 1, 2, 3, 7]],    // Room H → Math, Eng, Sci, Fil, TLE
      [8, [4, 5, 6, 8, 11]],   // Room I → AP, Values, MAPEH, CS, Literature
      [9, [0, 2, 8, 10, 11]],  // Room J → Math, Sci, CS, Algebra, Literature
    ];

    let csCount = 0;
    const csByClassSubject = new Map<string, number>();
    for (const [classIdx, subjIdxs] of csPlan) {
      for (const subjIdx of subjIdxs) {
        const availableFaculties = subjectFaculties[subjIdx];
        if (!availableFaculties || availableFaculties.length === 0) continue;

        const sid = subjectIds[subjIdx]!;
        for (const tid of availableFaculties) {
          const key = `${sid}-${tid}`;
          if (!usedPairs.has(key)) {
            usedPairs.add(key);
            const [result] = await connection.execute<ResultSetHeader>(
              "INSERT INTO class_subjects(classId, facultyId, subjectId) VALUES(?,?,?)",
              sql(classroomIds[classIdx]!, tid, sid)
            );
            csByClassSubject.set(`${classIdx}-${subjIdx}`, result.insertId);
            csCount++;
            break;
          }
        }
      }
    }

    // ──────────────────────────────────────────────────────
    // 12. Enrollment Details & Initial Student Academic Records
    // ──────────────────────────────────────────────────────
    console.log("Seeding enrollment_details...");
    for (let i = 0; i < enrollmentIds.length; i++) {
      const classIdx = getStudentClassroomIndex(i, classroomIds.length);
      const planEntry = csPlan.find(([ci]) => ci === classIdx);
      if (planEntry) {
        const [, subjectIdxs] = planEntry;
        for (let si = 0; si < Math.min(2, subjectIdxs.length); si++) {
          await connection.execute(
            "INSERT INTO enrollment_details(enrollmentId, subjectId) VALUES(?,?)",
            sql(enrollmentIds[i]!, subjectIds[subjectIdxs[si]!]!)
          );
        }
      }
    }

    console.log("Seeding student_academic_records...");
    const recordIds: number[] = [];
    for (let i = 0; i < enrollmentIds.length; i++) {
      const ci = getStudentClassroomIndex(i, classroomIds.length);
      const t = facultyData[ci]!;
      const adviserName = `${t.firstname} ${t.middlename} ${t.lastname}${t.suffix ? " " + t.suffix : ""}`;
      const [result] = await connection.execute<ResultSetHeader>(
        "INSERT INTO student_academic_records(enrollmentId, classSection, classGradeLevel, adviserName) VALUES(?,?,?,?)",
        sql(enrollmentIds[i]!, classroomData[ci]!.section, classroomData[ci]!.gradeLevel, adviserName)
      );
      recordIds.push(result.insertId);
    }

    // ──────────────────────────────────────────────────────
    // 13. Grading Demo Data
    // ──────────────────────────────────────────────────────
    console.log("Seeding grading demo data...");
    await connection.execute(
      "INSERT INTO grading_weights(classSubjectId, writtenWorkWeight, performanceTaskWeight, quarterlyAssessmentWeight, attendanceWeight) VALUES(NULL, 20.00, 60.00, 20.00, 0.00)"
    );

    const weightSeeds = [
      { classIdx: 0, subjectIdx: 0, ww: 19, pt: 57, qa: 19, attendance: 5 }, // Mathematics
      { classIdx: 0, subjectIdx: 1, ww: 28.5, pt: 47.5, qa: 19, attendance: 5 }, // English
      { classIdx: 0, subjectIdx: 2, ww: 19, pt: 57, qa: 19, attendance: 5 }, // Science
      { classIdx: 1, subjectIdx: 0, ww: 19, pt: 57, qa: 19, attendance: 5 }, // Mathematics — Section B
      { classIdx: 1, subjectIdx: 1, ww: 28.5, pt: 47.5, qa: 19, attendance: 5 }, // English — Section B
    ];
    for (const w of weightSeeds) {
      const csId = csByClassSubject.get(`${w.classIdx}-${w.subjectIdx}`);
      if (csId === undefined) {
        throw new Error(
          `Seed grading weights: no class_subjects row for classroom ${w.classIdx}, subject ${w.subjectIdx}`
        );
      }
      await connection.execute(
        "INSERT INTO grading_weights(classSubjectId, writtenWorkWeight, performanceTaskWeight, quarterlyAssessmentWeight, attendanceWeight) VALUES(?,?,?,?,?)",
        sql(csId, w.ww, w.pt, w.qa, w.attendance)
      );
    }

    const gradebookEnrollmentIds: number[] = [enrollmentIds[0]!, enrollmentIds[5]!];

    interface AssessmentSeed {
      type: AssessmentType;
      title: string;
      maxScore: number;
      dateGiven: string;
    }
    interface GradeSeed {
      classIdx: number;
      subjectIdx: number;
      quarter: number;
      assessments: AssessmentSeed[];
      scores: number[][];
      studentEnrollmentIds?: number[];
    }

    const gradeSeeds: GradeSeed[] = [
      {
        classIdx: 0,
        subjectIdx: 0,
        quarter: 1,
        assessments: [
          { type: "written_work", title: "Quiz 1: Fractions", maxScore: 20, dateGiven: "2026-08-15" },
          { type: "written_work", title: "Quiz 2: Decimals", maxScore: 20, dateGiven: "2026-09-05" },
          { type: "performance_task", title: "Problem Set", maxScore: 30, dateGiven: "2026-09-20" },
          { type: "performance_task", title: "Math Project", maxScore: 30, dateGiven: "2026-10-05" },
          { type: "quarterly_assessment", title: "Quarter 1 Exam", maxScore: 50, dateGiven: "2026-10-18" },
        ],
        scores: [
          [18, 15],
          [19, 14],
          [27, 24],
          [28, 22],
          [46, 40],
        ],
      },
      {
        classIdx: 0,
        subjectIdx: 1,
        quarter: 1,
        assessments: [
          { type: "written_work", title: "Quiz 1: Grammar", maxScore: 20, dateGiven: "2026-08-18" },
          { type: "written_work", title: "Persuasive Essay", maxScore: 30, dateGiven: "2026-09-12" },
          { type: "performance_task", title: "Speech Delivery", maxScore: 30, dateGiven: "2026-10-02" },
          { type: "performance_task", title: "Reading Portfolio", maxScore: 30, dateGiven: "2026-10-12" },
          { type: "quarterly_assessment", title: "Quarter 1 Exam", maxScore: 50, dateGiven: "2026-10-20" },
        ],
        scores: [
          [18, 14],
          [26, 22],
          [27, 20],
          [28, 24],
          [45, 42],
        ],
      },
      {
        classIdx: 0,
        subjectIdx: 2,
        quarter: 1,
        assessments: [
          { type: "written_work", title: "Quiz 1: Matter", maxScore: 20, dateGiven: "2026-08-20" },
          { type: "performance_task", title: "Lab Report", maxScore: 30, dateGiven: "2026-09-25" },
          { type: "performance_task", title: "Experiment Demo", maxScore: 30, dateGiven: "2026-10-08" },
          { type: "quarterly_assessment", title: "Quarter 1 Exam", maxScore: 50, dateGiven: "2026-10-22" },
        ],
        scores: [
          [17, 12],
          [27, 20],
          [28, 22],
          [44, 33],
        ],
      },
      {
        classIdx: 1,
        subjectIdx: 0,
        quarter: 1,
        assessments: [
          { type: "written_work", title: "Quiz 1: Integers", maxScore: 20, dateGiven: "2026-08-14" },
          { type: "written_work", title: "Quiz 2: Equations", maxScore: 20, dateGiven: "2026-09-04" },
          { type: "performance_task", title: "Problem Set", maxScore: 30, dateGiven: "2026-09-19" },
          { type: "performance_task", title: "Math Project", maxScore: 30, dateGiven: "2026-10-06" },
          { type: "quarterly_assessment", title: "Quarter 1 Exam", maxScore: 50, dateGiven: "2026-10-17" },
        ],
        scores: [
          [17, 16],
          [18, 17],
          [26, 25],
          [27, 26],
          [43, 41],
        ],
        studentEnrollmentIds: [enrollmentIds[1]!, enrollmentIds[6]!],
      },
      {
        classIdx: 1,
        subjectIdx: 1,
        quarter: 1,
        assessments: [
          { type: "written_work", title: "Quiz 1: Grammar", maxScore: 20, dateGiven: "2026-08-17" },
          { type: "performance_task", title: "Persuasive Essay", maxScore: 30, dateGiven: "2026-09-11" },
          { type: "performance_task", title: "Speech Delivery", maxScore: 30, dateGiven: "2026-10-01" },
          { type: "quarterly_assessment", title: "Quarter 1 Exam", maxScore: 50, dateGiven: "2026-10-19" },
        ],
        scores: [
          [16, 15],
          [25, 24],
          [26, 25],
          [42, 40],
        ],
        studentEnrollmentIds: [enrollmentIds[1]!, enrollmentIds[6]!],
      },
      {
        classIdx: 0,
        subjectIdx: 0,
        quarter: 2,
        assessments: [
          { type: "written_work", title: "Quiz 1: Algebra Basics", maxScore: 20, dateGiven: "2026-11-15" },
          { type: "performance_task", title: "Group Problem Solving", maxScore: 30, dateGiven: "2026-12-05" },
        ],
        scores: [
          [17, 12],
          [27, 21],
        ],
      },
    ];

    let assessmentCount = 0;
    let scoreCount = 0;
    for (const gradeSeed of gradeSeeds) {
      const csId = csByClassSubject.get(`${gradeSeed.classIdx}-${gradeSeed.subjectIdx}`);
      if (csId === undefined) {
        throw new Error(
          `Seed grading: no class_subjects row for classroom ${gradeSeed.classIdx}, subject ${gradeSeed.subjectIdx}`
        );
      }

      const assessmentIds: number[] = [];
      for (const a of gradeSeed.assessments) {
        const [result] = await connection.execute<ResultSetHeader>(
          "INSERT INTO assessments(classSubjectId, quarter, type, title, maxScore, dateGiven) VALUES(?,?,?,?,?,?)",
          sql(csId, gradeSeed.quarter, a.type, a.title, a.maxScore, a.dateGiven)
        );
        assessmentIds.push(result.insertId);
        assessmentCount++;
      }

      const studentList = gradeSeed.studentEnrollmentIds ?? gradebookEnrollmentIds;
      for (let ai = 0; ai < gradeSeed.assessments.length; ai++) {
        const row = gradeSeed.scores[ai];
        if (!row) continue;
        for (let si = 0; si < studentList.length; si++) {
          const score = row[si];
          if (score === undefined) continue;
          await connection.execute(
            "INSERT INTO student_scores(assessmentId, enrollmentId, score) VALUES(?,?,?)",
            sql(assessmentIds[ai]!, studentList[si]!, score)
          );
          scoreCount++;
        }
      }
    }

    // ──────────────────────────────────────────────────────
    // 14. Attendance Demo Data (Per-subject)
    // ──────────────────────────────────────────────────────
    console.log("Seeding student_attendance (per subject)...");
    let attendanceCount = 0;
    const attendanceDays = 8;
    const attendanceQuarter = 1;
    const attendanceSeeds: { subjectIdx: number; absences: [number[], number[]] }[] = [
      { subjectIdx: 0, absences: [[], [2, 5]] },      // Mathematics
      { subjectIdx: 1, absences: [[], [4]] },         // English
      { subjectIdx: 2, absences: [[3], []] },         // Science
    ];
    const today = new Date();
    for (const seedItem of attendanceSeeds) {
      const csId = csByClassSubject.get(`0-${seedItem.subjectIdx}`);
      if (csId === undefined) {
        throw new Error(
          `Seed attendance: no class_subjects row for classroom 0, subject ${seedItem.subjectIdx}`
        );
      }
      for (let day = 1; day <= attendanceDays; day++) {
        const date = new Date(today);
        date.setDate(today.getDate() - (attendanceDays - day));
        const dateStr = [
          date.getFullYear(),
          String(date.getMonth() + 1).padStart(2, "0"),
          String(date.getDate()).padStart(2, "0"),
        ].join("-");
        for (let si = 0; si < gradebookEnrollmentIds.length; si++) {
          const absentDays = seedItem.absences[si] ?? [];
          const status = absentDays.includes(day) ? "absent" : "present";
          await connection.execute(
            "INSERT INTO student_attendance(classSubjectId, enrollmentId, status, date, quarter) VALUES(?,?,?,?,?)",
            sql(csId, gradebookEnrollmentIds[si]!, status, dateStr, attendanceQuarter)
          );
          attendanceCount++;
        }
      }
    }

    // ──────────────────────────────────────────────────────
    // 15. School Info, Academic Settings & Landing Content
    // ──────────────────────────────────────────────────────
    console.log("Seeding school_info...");
    await connection.execute(
      "INSERT INTO school_info(schoolId, name, district, division, region, principal, address) VALUES(?,?,?,?,?,?,?)",
      sql(12345, "GradeSync National High School", "District I", "City Schools Division", "National Capital Region", "Dr. Juanito Ramos", "Manila, Philippines")
    );

    console.log("Seeding academic_settings...");
    await connection.execute(
      "INSERT INTO academic_settings(currentQuarter, numQuarters, enrollmentOpen, submissionsLocked) VALUES(1, 4, 1, 0)"
    );

    console.log("Seeding landing_content...");
    for (const [section, content] of Object.entries(LANDING_CONTENT_SEED)) {
      await connection.execute(
        "INSERT IGNORE INTO landing_content (section, content) VALUES (?, ?)",
        sql(section, JSON.stringify(content))
      );
    }

    // ──────────────────────────────────────────────────────
    // 16. Multi-Year Historical Academic Records (SF10 PDF Demo)
    // ──────────────────────────────────────────────────────
    await seedPdfHistory(connection);

    await connection.commit();

    // ──────────────────────────────────────────────────────
    // 17. Student-record Submissions (via submit service)
    // ──────────────────────────────────────────────────────
    console.log("Seeding student-record submissions (via submit service)...");
    const submissionStates: { classId: number; enrollmentId: number; quarter: number; adviserId: number }[] = [
      { classId: classroomIds[0]!, enrollmentId: enrollmentIds[0]!, quarter: 1, adviserId: facultyIds[0]! }, // Alex
      { classId: classroomIds[1]!, enrollmentId: enrollmentIds[1]!, quarter: 1, adviserId: facultyIds[1]! }, // Beatriz
      { classId: classroomIds[1]!, enrollmentId: enrollmentIds[6]!, quarter: 1, adviserId: facultyIds[1]! }, // Gabriel
    ];
    for (const sub of submissionStates) {
      await submitStudentRecordService(sub.classId, sub.enrollmentId, sub.quarter, sub.adviserId);
    }

    // ──────────────────────────────────────────────────────
    // Summary
    // ──────────────────────────────────────────────────────
    console.log("\n==========================================");
    console.log("  SEED COMPLETE!");
    console.log("==========================================");
    console.log(`  Users:                      ${3 + facultyIds.length + studentIds.length + 1} (admin, dev, register, faculties, sample students, test student)`);
    console.log(`  Faculties:                  ${facultyIds.length + 1} (${facultyIds.length} teachers + 1 register)`);
    console.log(`  Students:                   ${studentIds.length + 1} (${studentIds.length} sample + 1 PDF test student)`);
    console.log(`  Subjects:                   ${subjectIds.length}`);
    console.log(`  Classrooms:                 ${classroomIds.length}`);
    console.log(`  Schoolyears:                ${schoolYearIds.length}`);
    console.log(`  class_adviser:              ${Math.min(facultyIds.length, classroomIds.length)}`);
    console.log(`  TSA:                        ${tsaIds.flat().length}`);
    console.log(`  Enrollments:                ${enrollmentIds.length + 4} (${enrollmentIds.length} active + 4 historical SF10)`);
    console.log(`  class_subjects:             ${csCount}`);
    console.log(`  enrollment_details:         ${enrollmentIds.length * 2}`);
    console.log(`  student_academic_records:   ${recordIds.length + 4}`);
    console.log(`  student-record submissions: ${submissionStates.length}`);
    console.log(`  Assessments:                ${assessmentCount}`);
    console.log(`  student_scores:             ${scoreCount}`);
    console.log(`  student_attendance:         ${attendanceCount}`);
    console.log(`  grading_weights:            ${weightSeeds.length}`);
    console.log(`  school_info:                1`);
    console.log(`  landing_content:            ${Object.keys(LANDING_CONTENT_SEED).length} sections`);
    console.log("==========================================");
    console.log("  Default password for all users: password123");
    console.log("==========================================\n");
  } catch (err) {
    await connection.rollback();
    console.error("Seed failed, transaction rolled back.", err);
    process.exit(1);
  } finally {
    connection.release();
    await pool.end();
  }
}

// ────────────────────────────────────────────────────────────
// CLI Execution Routing
// ────────────────────────────────────────────────────────────
const isDirectRun =
  import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, "/")}` ||
  Boolean(process.argv[1]?.endsWith("seed.ts") || process.argv[1]?.endsWith("seed.js"));

if (isDirectRun) {
  const args = process.argv.slice(2);
  const studentsOnly = args.includes("--students-only") || args.includes("--students");
  const pdfOnly = args.includes("--pdf-only") || args.includes("--pdf");

  if (studentsOnly) {
    const pool = getDBPoolConnection();
    seedStudentsOnly()
      .then(async () => {
        await pool.end();
        process.exit(0);
      })
      .catch(async (err) => {
        console.error(err);
        await pool.end();
        process.exit(1);
      });
  } else if (pdfOnly) {
    const pool = getDBPoolConnection();
    seedPdfHistory()
      .then(async () => {
        await pool.end();
        process.exit(0);
      })
      .catch(async (err) => {
        console.error(err);
        await pool.end();
        process.exit(1);
      });
  } else {
    seed()
      .then(() => process.exit(0))
      .catch((err) => {
        console.error(err);
        process.exit(1);
      });
  }
}
