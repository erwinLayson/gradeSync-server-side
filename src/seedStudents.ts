import dotenv from "dotenv";
dotenv.config();

import bcrypt from "bcrypt";
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getDBPoolConnection } from "./config/database.js";
import { SAMPLE_STUDENTS, type SampleStudent } from "./constant/sampleStudents.js";

function sql(...args: (string | number | null | undefined)[]): (string | number | null)[] {
  return args.map((v) => (v === undefined ? null : v));
}

export async function seedStudentsOnly(): Promise<{ totalProcessed: number; newlyAdded: number }> {
  const pool = getDBPoolConnection();
  const connection: PoolConnection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    console.log(`Starting seed of sample student data (dataset size: ${SAMPLE_STUDENTS.length})...`);

    // 1. Get or create active school year
    let [syRows] = await connection.execute<RowDataPacket[]>(
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

    // 3. Fetch advisers per classroom (or default adviser name)
    const [adviserRows] = await connection.execute<RowDataPacket[]>(`
      SELECT ca.classId, f.firstname, f.middlename, f.lastname, f.suffix
      FROM class_adviser ca
      JOIN faculties f ON f.id = ca.facultyId
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
        // Ensure student status is active and userId is linked
        await connection.execute(
          "UPDATE students SET userId = ?, status = 'active' WHERE id = ?",
          [userId, studentId]
        );
      } else {
        const [stRes] = await connection.execute<ResultSetHeader>(
          "INSERT INTO students(userId, lrn, email, firstname, middlename, lastname, suffix, birthdate, sex, status) VALUES(?,?,?,?,?,?,?,?,?, 'active')",
          sql(userId, s.lrn, s.email, s.firstname, s.middlename, s.lastname, s.suffix, s.birthdate, s.sex)
        );
        studentId = stRes.insertId;
        newlyAdded++;
      }

      // Upsert student_details
      await connection.execute(
        `INSERT INTO student_details(studentId, birthplace, permanentAddress, religion, contactNumber, guardianName, guardianRelation, guardianContact, guardianOccupation)
         VALUES(?,?,?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE
           birthplace = VALUES(birthplace),
           permanentAddress = VALUES(permanentAddress),
           religion = VALUES(religion),
           contactNumber = VALUES(contactNumber),
           guardianName = VALUES(guardianName),
           guardianRelation = VALUES(guardianRelation),
           guardianContact = VALUES(guardianContact),
           guardianOccupation = VALUES(guardianOccupation)`,
        sql(
          studentId,
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

      // Distribute student into classrooms
      // Preserve original classroom assignment for first 10 students (i % 5), then distribute across all classrooms
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

        // Link class_students
        await connection.execute(
          "INSERT IGNORE INTO class_students(classId, enrollmentId) VALUES(?,?)",
          sql(targetClassroom.id, enrollmentId)
        );

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

// Allow direct CLI execution
if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, "/")}`) {
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
}
