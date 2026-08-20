import dotenv from "dotenv";
dotenv.config();

import bcrypt from "bcrypt";
import type{ ResultSetHeader } from "mysql2/promise";
import { getDBPoolConnection } from "./config/database.js";

import type { AssessmentType } from "./constant/assessment.js";

// Reused to freeze the demo submissions so the frozen grades match exactly what
// the teacher page computes (no hand-rolled constants to drift).
import { submitStudentRecordService } from "./service/studentRecord.js";

// Helper: coerce values to mysql-compatible array
function sql(...args: (string | number | null | undefined)[]): (string | number | null)[] {
  return args.map((v) => (v === undefined ? null : v));
}

async function seed() {
  const pool = getDBPoolConnection();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // ──────────────────────────────────────────────────────
    // 1. Clear existing data (reverse dependency order)
    // ──────────────────────────────────────────────────────
    console.log("Clearing existing data...");
    // Student records first — they reference enrollments, class_subjects, teachers, subjects.
    await connection.execute("DELETE FROM student_academic_record_quarters");
    await connection.execute("DELETE FROM student_academic_record_subjects");
    await connection.execute("DELETE FROM student_academic_records");
    await connection.execute("DELETE FROM student_scores");
    await connection.execute("DELETE FROM student_attendance");
    await connection.execute("DELETE FROM assessments");
    await connection.execute("DELETE FROM grading_weights");
    await connection.execute("DELETE FROM class_subjects");
    await connection.execute("DELETE FROM enrollment_details");
    await connection.execute("DELETE FROM class_students");
    await connection.execute("DELETE FROM enrollments");
    await connection.execute("DELETE FROM teacher_subject_assignment");
    await connection.execute("DELETE FROM class_teacher");
    await connection.execute("DELETE FROM classrooms");
    await connection.execute("DELETE FROM subjects");
    await connection.execute("DELETE FROM students");
    await connection.execute("DELETE FROM teachers");
    await connection.execute("DELETE FROM users");
    await connection.execute("DELETE FROM schoolyear");
    await connection.execute("DELETE FROM school_info");

    // ──────────────────────────────────────────────────────
    // 2. Users (1 admin + 10 teachers + 10 students = 21)
    // ──────────────────────────────────────────────────────
    console.log("Seeding users...");
    const hash = await bcrypt.hash("password123", 10);

    await connection.execute(
      "INSERT INTO users(email, password, role) VALUES(?,?,?)",
      sql("admin@gradesync.edu", hash, "admin")
    );

    const teacherEmails: string[] = [
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
    const teacherUserIds: number[] = [];
    for (const email of teacherEmails) {
      const [result] = await connection.execute<ResultSetHeader>(
        "INSERT INTO users(email, password, role) VALUES(?,?,?)",
        sql(email, hash, "teacher")
      );
      teacherUserIds.push(result.insertId);
    }

    const studentEmails: string[] = [
      "alex.garcia@student.edu",
      "beatriz.mercado@student.edu",
      "carlo.mendoza@student.edu",
      "diana.lorenzo@student.edu",
      "eduardo.silva@student.edu",
      "francesca.cruz@student.edu",
      "gabriel.torres@student.edu",
      "hannah.aguilar@student.edu",
      "ivan.delossantos@student.edu",
      "jasmine.romero@student.edu",
    ];
    const studentUserIds: number[] = [];
    for (const email of studentEmails) {
      const [result] = await connection.execute<ResultSetHeader>(
        "INSERT INTO users(email, password, role) VALUES(?,?,?)",
        sql(email, hash, "student")
      );
      studentUserIds.push(result.insertId);
    }

    // ──────────────────────────────────────────────────────
    // 3. Teachers (10)
    // ──────────────────────────────────────────────────────
    console.log("Seeding teachers...");
    const teacherData = [
      { firstname: "Juan", middlename: "M.", lastname: "Dela Cruz", suffix: null },
      { firstname: "Maria", middlename: "L.", lastname: "Santos", suffix: null },
      { firstname: "Carlos", middlename: "R.", lastname: "Reyes", suffix: "Jr." },
      { firstname: "Ana", middlename: "P.", lastname: "Gonzales", suffix: null },
      { firstname: "Pedro", middlename: "S.", lastname: "Ramos", suffix: null },
      { firstname: "Luz", middlename: "T.", lastname: "Villanueva", suffix: null },
      { firstname: "Miguel", middlename: "D.", lastname: "Angeles", suffix: "III" },
      { firstname: "Rosa", middlename: "C.", lastname: "Lopez", suffix: null },
      { firstname: "Antonio", middlename: "B.", lastname: "Flores", suffix: null },
      { firstname: "Elena", middlename: "G.", lastname: "Garcia", suffix: null },
    ];
    const teacherIds: number[] = [];
    for (let i = 0; i < teacherData.length; i++) {
      const t = teacherData[i]!;
      const [result] = await connection.execute<ResultSetHeader>(
        "INSERT INTO teachers(email, firstname, middlename, lastname, suffix, userId) VALUES(?,?,?,?,?,?)",
        sql(teacherEmails[i]!, t.firstname, t.middlename, t.lastname, t.suffix, teacherUserIds[i]!)
      );
      teacherIds.push(result.insertId);
    }

    // ──────────────────────────────────────────────────────
    // 4. Students (10)
    // ──────────────────────────────────────────────────────
    console.log("Seeding students...");
    const studentData = [
      { lrn: "123456789001", firstname: "Alex", middlename: "R.", lastname: "Garcia", suffix: null, birthdate: "2008-03-15", sex: "Male" },
      { lrn: "123456789002", firstname: "Beatriz", middlename: "S.", lastname: "Mercado", suffix: null, birthdate: "2009-07-22", sex: "Female" },
      { lrn: "123456789003", firstname: "Carlo", middlename: "T.", lastname: "Mendoza", suffix: null, birthdate: "2008-11-02", sex: "Male" },
      { lrn: "123456789004", firstname: "Diana", middlename: "L.", lastname: "Lorenzo", suffix: null, birthdate: "2009-01-14", sex: "Female" },
      { lrn: "123456789005", firstname: "Eduardo", middlename: "V.", lastname: "Silva", suffix: null, birthdate: "2008-05-30", sex: "Male" },
      { lrn: "123456789006", firstname: "Francesca", middlename: "M.", lastname: "Cruz", suffix: null, birthdate: "2009-09-18", sex: "Female" },
      { lrn: "123456789007", firstname: "Gabriel", middlename: "N.", lastname: "Torres", suffix: "II", birthdate: "2008-12-25", sex: "Male" },
      { lrn: "123456789008", firstname: "Hannah", middlename: "P.", lastname: "Aguilar", suffix: null, birthdate: "2009-04-08", sex: "Female" },
      { lrn: "123456789009", firstname: "Ivan", middlename: "Q.", lastname: "Delos Santos", suffix: null, birthdate: "2008-08-19", sex: "Male" },
      { lrn: "123456789010", firstname: "Jasmine", middlename: "R.", lastname: "Romero", suffix: null, birthdate: "2009-06-05", sex: "Female" },
    ];
    const studentIds: number[] = [];
    for (let i = 0; i < studentData.length; i++) {
      const s = studentData[i]!;
      const [result] = await connection.execute<ResultSetHeader>(
        "INSERT INTO students(userId, lrn, email, firstname, middlename, lastname, suffix, birthdate, sex) VALUES(?,?,?,?,?,?,?,?,?)",
        sql(studentUserIds[i]!, s.lrn, studentEmails[i]!, s.firstname, s.middlename, s.lastname, s.suffix, s.birthdate, s.sex)
      );
      studentIds.push(result.insertId);
    }

    // ──────────────────────────────────────────────────────
    // 5. Subjects (12)
    // ──────────────────────────────────────────────────────
    console.log("Seeding subjects...");
    const subjectData = [
      { name: "Mathematics", code: "MATH101", unit: 3 },
      { name: "English", code: "ENG101", unit: 3 },
      { name: "Science", code: "SCI101", unit: 3 },
      { name: "Filipino", code: "FIL101", unit: 3 },
      { name: "Araling Panlipunan", code: "AP101", unit: 2 },
      { name: "Values Education", code: "VAL101", unit: 2 },
      { name: "MAPEH", code: "MAPEH101", unit: 2 },
      { name: "Technology and Livelihood Education", code: "TLE101", unit: 2 },
      { name: "Computer Science", code: "CS101", unit: 3 },
      { name: "Science 2 - Chemistry", code: "SCI201", unit: 3 },
      { name: "Mathematics 2 - Algebra", code: "MATH201", unit: 3 },
      { name: "English 2 - Literature", code: "ENG201", unit: 3 },
    ];
    const subjectIds: number[] = [];
    for (const subj of subjectData) {
      const [result] = await connection.execute<ResultSetHeader>(
        "INSERT INTO subjects(name, code, unit) VALUES(?,?,?)",
        sql(subj.name, subj.code, subj.unit)
      );
      subjectIds.push(result.insertId);
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
    // 7. schoolyear (10 school years)
    // ──────────────────────────────────────────────────────
    console.log("Seeding schoolyear...");
    // The LAST entry is the ACTIVE school year (isActive = 1) — the one
    // enrollments and the student-record submission workflow operate on.
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
    // 8. class_teacher (10 — assign each teacher to a classroom)
    // ──────────────────────────────────────────────────────
    console.log("Seeding class_teacher (advisers)...");
    for (let i = 0; i < Math.min(teacherIds.length, classroomIds.length); i++) {
      await connection.execute(
        "INSERT INTO class_teacher(teacherId, classId) VALUES(?,?)",
        sql(teacherIds[i]!, classroomIds[i]!)
      );
    }

    // ──────────────────────────────────────────────────────
    // 9. teacher_subject_assignment (15 assignments)
    // ──────────────────────────────────────────────────────
    console.log("Seeding teacher_subject_assignment...");
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
    // tsaIds maps [subjectIndex] → array of TSA insertIds
    const tsaIds: number[][] = subjectIds.map(() => []);
    for (const [subjIdx, teacherIdxs] of tsaPlan) {
      for (const teachIdx of teacherIdxs) {
        const [result] = await connection.execute<ResultSetHeader>(
          "INSERT INTO teacher_subject_assignment(teacherId, subjectId) VALUES(?,?)",
          sql(teacherIds[teachIdx]!, subjectIds[subjIdx]!)
        );
        const list = tsaIds[subjIdx];
        if (list) list.push(result.insertId);
      }
    }

    // ──────────────────────────────────────────────────────
    // 10. enrollments (10 — one per student)
    //     Columns: id, dateEnrolled, classId, schoolYearId, studentId
    // ──────────────────────────────────────────────────────
    console.log("Seeding enrollments...");
    const enrollmentIds: number[] = [];
    for (let i = 0; i < studentIds.length; i++) {
      const ci = i % 5; // distribute across first 5 classrooms
      const [result] = await connection.execute<ResultSetHeader>(
        "INSERT INTO enrollments(dateEnrolled, classId, schoolYearId, studentId) VALUES(CURDATE(),?,?,?)",
        sql(classroomIds[ci]!, schoolYearIds[schoolYearIds.length - 1]!, studentIds[i]!)
      );
      enrollmentIds.push(result.insertId);
    }

    // ──────────────────────────────────────────────────────
    // 11. class_students (10 — link enrollments to classrooms)
    // ──────────────────────────────────────────────────────
    console.log("Seeding class_students...");
    for (let i = 0; i < enrollmentIds.length; i++) {
      const ci = i % 5;
      await connection.execute(
        "INSERT INTO class_students(classId, enrollmentId) VALUES(?,?)",
        sql(classroomIds[ci]!, enrollmentIds[i]!)
      );
    }

    // ──────────────────────────────────────────────────────
    // 12. class_subjects — assign teachers+subjects to classrooms
    //     Columns: classId, teacherId, subjectId
    //     UNIQUE constraint on (subjectId, teacherId) — each
    //     teacher can only teach a specific subject once.
    //     So we assign one unique (subjectId,teacherId) per classroom.
    // ──────────────────────────────────────────────────────
    console.log("Seeding class_subjects...");
    // Build map: subjectIndex → list of teacherIds for that subject
    const subjectTeachers: number[][] = subjectIds.map(() => []);
    for (const [subjIdx, teacherIdxs] of tsaPlan) {
      const list = subjectTeachers[subjIdx];
      if (list) {
        for (const teachIdx of teacherIdxs) {
          list.push(teacherIds[teachIdx]!);
        }
      }
    }
    // Track which (subjectId, teacherId) pairs have been used
    const usedPairs = new Set<string>();

    // Plan: classroom index → [subject indices to assign]
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
    // Tracks the inserted class_subjects id per (classroomIdx, subjectIdx) pair
    // so the grading demo data below can attach assessments to the right rows.
    const csByClassSubject = new Map<string, number>();
    for (const [classIdx, subjIdxs] of csPlan) {
      for (const subjIdx of subjIdxs) {
        const availableTeachers = subjectTeachers[subjIdx];
        if (!availableTeachers || availableTeachers.length === 0) continue;

        const sid = subjectIds[subjIdx]!;
        // Find the first teacher for this subject whose (subjectId, teacherId) pair
        // hasn't been used yet
        let assigned = false;
        for (const tid of availableTeachers) {
          const key = `${sid}-${tid}`;
          if (!usedPairs.has(key)) {
            usedPairs.add(key);
            const [result] = await connection.execute<ResultSetHeader>(
              "INSERT INTO class_subjects(classId, teacherId, subjectId) VALUES(?,?,?)",
              sql(classroomIds[classIdx]!, tid, sid)
            );
            csByClassSubject.set(`${classIdx}-${subjIdx}`, result.insertId);
            csCount++;
            assigned = true;
            break;
          }
        }
        // If no unique (subjectId, teacherId) pair is available,
        // this subject simply can't be assigned to more classrooms
        if (!assigned) {
          console.log(`  ↳ Skipping subjectIdx ${subjIdx} for classroom ${classIdx} (no unused teacher-subject pair left)`);
        }
      }
    }

    // ──────────────────────────────────────────────────────
    // 13. enrollment_details (10 — link enrollments to subjects)
    // ──────────────────────────────────────────────────────
    console.log("Seeding enrollment_details...");
    for (let i = 0; i < enrollmentIds.length; i++) {
      // Each enrollment gets the first 2 subjects from their classroom's plan
      const classIdx = i % 5;
      const planEntry = csPlan.find(([ci]) => ci === classIdx);
      if (planEntry) {
        const [, subjectIdxs] = planEntry;
        // Assign first 2 subjects for this enrollment
        for (let si = 0; si < Math.min(2, subjectIdxs.length); si++) {
          await connection.execute(
            "INSERT INTO enrollment_details(enrollmentId, subjectId) VALUES(?,?)",
            sql(enrollmentIds[i]!, subjectIds[subjectIdxs[si]!]!)
          );
        }
      }
    }

    // ──────────────────────────────────────────────────────
    // 13b. student_academic_records (10 — one official record per enrollment)
    //     Columns: id, enrollmentId, classSection, classGradeLevel, adviserName
    //     Every enrollment gets a record file. Quarterly grades are frozen into
    //     student_academic_record_subjects at submission time (section 15b),
    //     which reuses the real submit service so the values never drift.
    // ──────────────────────────────────────────────────────
    console.log("Seeding student_academic_records...");
    const recordIds: number[] = [];
    for (let i = 0; i < enrollmentIds.length; i++) {
      const ci = i % 5;
      const t = teacherData[ci]!;
      // Same shape as the teachers model's fullname (first, middle, last, suffix).
      const adviserName = `${t.firstname} ${t.middlename} ${t.lastname}${t.suffix ? " " + t.suffix : ""}`;
      const [result] = await connection.execute<ResultSetHeader>(
        "INSERT INTO student_academic_records(enrollmentId, classSection, classGradeLevel, adviserName) VALUES(?,?,?,?)",
        sql(enrollmentIds[i]!, classroomData[ci]!.section, classroomData[ci]!.gradeLevel, adviserName)
      );
      recordIds.push(result.insertId);
    }

    // ──────────────────────────────────────────────────────
    // 14. Grading demo data (grading_weights + assessments + student_scores)
    //     Targets Section A - G7 (classroom index 0), which enrolls
    //     Alex and Francesca, and Section B - G7 (classroom index 1), which
    //     enrolls Beatriz and Gabriel, in the default seed distribution.
    // ──────────────────────────────────────────────────────
    console.log("Seeding grading demo data...");

    // DepEd DO 8 s. 2015 component weights for the demo class subjects in
    // Section A - G7 (classroom index 0) and Section B - G7 (classroom index 1).
    // Weights are per CLASS SUBJECT so each teacher's assignment gets its own
    // configuration. The four weights must total EXACTLY 100 (enforced by the
    // chk_weights_total CHECK constraint): attendance 5 is carved out of the
    // academic share, e.g. Mathematics 19/57/19 academic + 5 attendance = 100.
    // Section B has no attendance rows, so its attendance weight is simply not
    // counted (computeQuarterGrade skips it when no attendance exists).
    const weightSeeds: { classIdx: number; subjectIdx: number; ww: number; pt: number; qa: number; attendance: number }[] = [
      { classIdx: 0, subjectIdx: 0, ww: 19, pt: 57, qa: 19, attendance: 5 }, // Mathematics (19+57+19+5 = 100)
      { classIdx: 0, subjectIdx: 1, ww: 28.5, pt: 47.5, qa: 19, attendance: 5 }, // English (28.5+47.5+19+5 = 100)
      { classIdx: 0, subjectIdx: 2, ww: 19, pt: 57, qa: 19, attendance: 5 }, // Science (19+57+19+5 = 100)
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

    // The students enrolled in Section A - G7 (classroom index 0):
    // i % 5 === 0 → Alex (i=0) and Francesca (i=5). Derived from the same
    // `ci = i % 5` distribution used for enrollments so the demo scores and
    // attendance always attach to the right roster. Both are stored against
    // the student's ENROLLMENT id (student_scores.enrollmentId and
    // student_attendance.enrollmentId). Section B seeds pass their own roster
    // via studentEnrollmentIds below.
    const gradebookEnrollmentIds: number[] = [];
    for (let i = 0; i < studentIds.length; i++) {
      if (i % 5 === 0) {
        gradebookEnrollmentIds.push(enrollmentIds[i]!);
      }
    }

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
      // scores[assessmentIndex][studentIndex] -> raw score
      scores: number[][];
      // Which enrollments the score columns map to (default: the Section A
      // roster gradebookEnrollmentIds). Section B passes its own roster below.
      studentEnrollmentIds?: number[];
    }

    const gradeSeeds: GradeSeed[] = [
      {
        classIdx: 0,
        subjectIdx: 0, // Mathematics
        quarter: 1,
        assessments: [
          { type: "written_work", title: "Quiz 1: Fractions", maxScore: 20, dateGiven: "2026-08-15" },
          { type: "written_work", title: "Quiz 2: Decimals", maxScore: 20, dateGiven: "2026-09-05" },
          { type: "performance_task", title: "Problem Set", maxScore: 30, dateGiven: "2026-09-20" },
          { type: "performance_task", title: "Math Project", maxScore: 30, dateGiven: "2026-10-05" },
          { type: "quarterly_assessment", title: "Quarter 1 Exam", maxScore: 50, dateGiven: "2026-10-18" },
        ],
        // Alex (91.9) / Francesca (76.5) — both pass
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
        subjectIdx: 1, // English
        quarter: 1,
        assessments: [
          { type: "written_work", title: "Quiz 1: Grammar", maxScore: 20, dateGiven: "2026-08-18" },
          { type: "written_work", title: "Persuasive Essay", maxScore: 30, dateGiven: "2026-09-12" },
          { type: "performance_task", title: "Speech Delivery", maxScore: 30, dateGiven: "2026-10-02" },
          { type: "performance_task", title: "Reading Portfolio", maxScore: 30, dateGiven: "2026-10-12" },
          { type: "quarterly_assessment", title: "Quarter 1 Exam", maxScore: 50, dateGiven: "2026-10-20" },
        ],
        // Alex (90.23) / Francesca (75.07) — both pass, Francesca barely
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
        subjectIdx: 2, // Science
        quarter: 1,
        assessments: [
          { type: "written_work", title: "Quiz 1: Matter", maxScore: 20, dateGiven: "2026-08-20" },
          { type: "performance_task", title: "Lab Report", maxScore: 30, dateGiven: "2026-09-25" },
          { type: "performance_task", title: "Experiment Demo", maxScore: 30, dateGiven: "2026-10-08" },
          { type: "quarterly_assessment", title: "Quarter 1 Exam", maxScore: 50, dateGiven: "2026-10-22" },
        ],
        // Alex (89.6, passes) / Francesca (67.2, fails — shows the Failed chip)
        scores: [
          [17, 12],
          [27, 20],
          [28, 22],
          [44, 33],
        ],
      },
      {
        classIdx: 1,
        subjectIdx: 0, // Mathematics — Section B (Beatriz / Gabriel)
        quarter: 1,
        assessments: [
          { type: "written_work", title: "Quiz 1: Integers", maxScore: 20, dateGiven: "2026-08-14" },
          { type: "written_work", title: "Quiz 2: Equations", maxScore: 20, dateGiven: "2026-09-04" },
          { type: "performance_task", title: "Problem Set", maxScore: 30, dateGiven: "2026-09-19" },
          { type: "performance_task", title: "Math Project", maxScore: 30, dateGiven: "2026-10-06" },
          { type: "quarterly_assessment", title: "Quarter 1 Exam", maxScore: 50, dateGiven: "2026-10-17" },
        ],
        // Both pass
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
        subjectIdx: 1, // English — Section B (Beatriz / Gabriel)
        quarter: 1,
        assessments: [
          { type: "written_work", title: "Quiz 1: Grammar", maxScore: 20, dateGiven: "2026-08-17" },
          { type: "performance_task", title: "Persuasive Essay", maxScore: 30, dateGiven: "2026-09-11" },
          { type: "performance_task", title: "Speech Delivery", maxScore: 30, dateGiven: "2026-10-01" },
          { type: "quarterly_assessment", title: "Quarter 1 Exam", maxScore: 50, dateGiven: "2026-10-19" },
        ],
        // Both pass
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
        subjectIdx: 0, // Mathematics — second quarter (partial: no QA yet)
        quarter: 2,
        assessments: [
          { type: "written_work", title: "Quiz 1: Algebra Basics", maxScore: 20, dateGiven: "2026-11-15" },
          { type: "performance_task", title: "Group Problem Solving", maxScore: 30, dateGiven: "2026-12-05" },
        ],
        // Alex (88.75, passes) / Francesca (67.5, fails)
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

      // The score columns map to the seed's own roster (default: Section A).
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
    // 14b. Attendance demo data — PER SUBJECT (Section A - G7, classIdx 0)
    //     Attendance is keyed by (classSubjectId, enrollmentId, date), so each
    //     subject has its OWN attendance: a student can be present in Science
    //     and absent in Math on the same day. Each subject below gets a
    //     different absence pattern to demonstrate this. Alex is
    //     gradebookEnrollmentIds[0], Francesca gradebookEnrollmentIds[1].
    //     With attendanceWeight 5 the attendance share is 5/100 of the grade.
    //     Every seeded day is Quarter 1 (the dates are near the current date,
    //     which falls inside Q1 of the school year), so the history view's
    //     quarter filter can demonstrate Q1 populated and Q2-Q4 empty.
    // ──────────────────────────────────────────────────────
    console.log("Seeding student_attendance (per subject)...");
    let attendanceCount = 0;
    const attendanceDays = 8;
    const attendanceQuarter = 1;
    // Per subject: which day numbers (1-8) each student is absent on.
    // [alexAbsentDays, francescaAbsentDays]
    const attendanceSeeds: { subjectIdx: number; absences: [number[], number[]] }[] = [
      { subjectIdx: 0, absences: [[], [2, 5]] },      // Mathematics: Alex 100% / Francesca 75%
      { subjectIdx: 1, absences: [[], [4]] },         // English: Alex 100% / Francesca 87.5%
      { subjectIdx: 2, absences: [[3], []] },         // Science: Alex 87.5% / Francesca 100%
    ];
    // Dates go from (today - 7) back to today so the UNIQUE
    // (classSubjectId, enrollmentId, date) key stays distinct per day.
    // Format locally (not toISOString) so the dates match what the attendance
    // page shows in its date input regardless of the server's timezone.
    const today = new Date();
    for (const seed of attendanceSeeds) {
      const csId = csByClassSubject.get(`0-${seed.subjectIdx}`);
      if (csId === undefined) {
        throw new Error(
          `Seed attendance: no class_subjects row for classroom 0, subject ${seed.subjectIdx}`
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
          const absentDays = seed.absences[si] ?? [];
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
    // 15. school_info (1 record)
    //     Columns: id (auto), schoolId, name, district, division, region
    // ──────────────────────────────────────────────────────
    console.log("Seeding school_info...");
    await connection.execute(
      "INSERT INTO school_info(schoolId, name, district, division, region) VALUES(?,?,?,?,?)",
      sql(12345, "GradeSync National High School", "District I", "City Schools Division", "National Capital Region")
    );

    await connection.commit();

    // ──────────────────────────────────────────────────────
    // 15b. Student-record submissions (demo states for the feature)
    //     Runs AFTER commit (the submit service opens its own connection), and
    //     reuses the REAL submit path so frozen grades and timestamps are
    //     exactly what the app itself would write.
    //
    //     Section A - G7: Alex submitted (frozen grades demo), Francesca left
    //       pending — she is fully graded, so the teacher page shows her live
    //       grades and "Review & Submit" works (partial/amber in the tracker).
    //     Section B - G7: Beatriz + Gabriel both submitted — a COMPLETE class
    //       (green in the tracker).
    //     Sections C-E have no grades yet, so their students stay pending and
    //       E2 blocks submission — the quarter-advance gate reports them.
    // ──────────────────────────────────────────────────────
    console.log("Seeding student-record submissions (via submit service)...");
    const submissionStates: { classId: number; enrollmentId: number; quarter: number; adviserId: number }[] = [
      { classId: classroomIds[0]!, enrollmentId: enrollmentIds[0]!, quarter: 1, adviserId: teacherIds[0]! }, // Alex — Section A
      { classId: classroomIds[1]!, enrollmentId: enrollmentIds[1]!, quarter: 1, adviserId: teacherIds[1]! }, // Beatriz — Section B
      { classId: classroomIds[1]!, enrollmentId: enrollmentIds[6]!, quarter: 1, adviserId: teacherIds[1]! }, // Gabriel — Section B
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
    console.log(`  Users:              21 (1 admin + 10 teachers + 10 students)`);
    console.log(`  Teachers:           ${teacherIds.length}`);
    console.log(`  Students:           ${studentIds.length}`);
    console.log(`  Subjects:           ${subjectIds.length}`);
    console.log(`  Classrooms:         ${classroomIds.length}`);
    console.log(`  Schoolyears:        ${schoolYearIds.length}`);
    console.log(`  class_teacher:      ${Math.min(teacherIds.length, classroomIds.length)} (adviser assignments)`);
    console.log(`  TSA:                ${tsaIds.flat().length} (teacher-subject assignments)`);
    console.log(`  Enrollments:        ${enrollmentIds.length}`);
    console.log(`  class_students:     ${enrollmentIds.length}`);
    console.log(`  class_subjects:     ${csCount} (${csPlan.reduce((sum, [, idxs]) => sum + idxs.length, 0)} planned, ${csPlan.reduce((sum, [, idxs]) => sum + idxs.length, 0) - csCount} skipped due to unique constraint)`);
    console.log(`  enrollment_details: ${enrollmentIds.length * 2}`);
    console.log(`  student_academic_records: ${recordIds.length}`);
    console.log(`  student-record submissions: ${submissionStates.length} (Q1 — Alex: submitted, Francesca: pending; Section B complete)`);
    console.log(`  Assessments:        ${assessmentCount}`);
    console.log(`  student_scores:     ${scoreCount}`);
    console.log(`  student_attendance: ${attendanceCount}`);
    console.log(`  grading_weights:    ${weightSeeds.length}`);
    console.log(`  school_info:        1`);
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

seed();
