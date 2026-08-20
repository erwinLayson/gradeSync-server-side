// ----------------------------------------------------------------------------
// seed_pdf_history.ts — give one test student a complete 4-school-year academic
// history so the SF10 PDF can be checked against a realistic record.
//
// Creates (find-or-create by LRN):
//   - a test student (user account "pdf.test@student.edu" / password123)
//   - 4 enrollments: 2019-2020 (G7) -> 2020-2021 (G8) -> 2021-2022 (G9)
//     -> 2022-2023 (G10), reusing existing classrooms
//   - one student_academic_records row per year (section/grade/adviser snapshots)
//   - per-record frozen grades (q1..q4) for 3 subjects, including one FAILING
//     subject (Filipino, final < 75) to exercise the "Failed" remarks column
//
// Idempotent: re-running replaces only this student's rows in the 4 target
// school years (2019-2020 .. 2022-2023). Other data is untouched.
//
// Usage: from the server directory -> npx tsx seed_pdf_history.ts
// ----------------------------------------------------------------------------
import "dotenv/config";
import bcrypt from "bcrypt";
import type { ResultSetHeader } from "mysql2/promise";
import mysql from "mysql2/promise";

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 1
});

const TEST_LRN = "123456789099";
const TEST_EMAIL = "pdf.test@student.edu";

// One school year of history for the test student.
// schoolYearId: 84=2019-2020, 85=2020-2021, 86=2021-2022, 87=2022-2023
const YEARS = [
    {
        schoolYearId: 84,
        classId: 81, // Section A - G7
        section: "Section A - G7",
        gradeLevel: 7,
        adviserName: "Maria L. Santos",
        dateEnrolled: "2019-06-10",
        subjects: [
            { name: "Mathematics", code: "MATH101", q1: 90, q2: 92, q3: 88, q4: 94 },
            { name: "English", code: "ENG101", q1: 85, q2: 87, q3: 90, q4: 88 },
            { name: "Filipino", code: "FIL101", q1: 80, q2: 82, q3: 85, q4: 83 }
        ]
    },
    {
        schoolYearId: 85,
        classId: 83, // Section C - G8
        section: "Section C - G8",
        gradeLevel: 8,
        adviserName: "Carlos R. Reyes",
        dateEnrolled: "2020-06-10",
        subjects: [
            { name: "Science", code: "SCI101", q1: 88, q2: 90, q3: 86, q4: 92 },
            { name: "English", code: "ENG101", q1: 91, q2: 93, q3: 89, q4: 95 },
            { name: "Filipino", code: "FIL101", q1: 72, q2: 74, q3: 71, q4: 73 } // final < 75 -> Failed
        ]
    },
    {
        schoolYearId: 86,
        classId: 85, // Section E - G9
        section: "Section E - G9",
        gradeLevel: 9,
        adviserName: "Ana P. Gonzales",
        dateEnrolled: "2021-06-10",
        subjects: [
            { name: "Mathematics", code: "MATH101", q1: 95, q2: 93, q3: 97, q4: 96 },
            { name: "Araling Panlipunan", code: "AP101", q1: 86, q2: 88, q3: 90, q4: 87 },
            { name: "English", code: "ENG101", q1: 89, q2: 91, q3: 93, q4: 92 }
        ]
    },
    {
        schoolYearId: 87,
        classId: 87, // Section G - G10
        section: "Section G - G10",
        gradeLevel: 10,
        adviserName: "Pedro S. Ramos",
        dateEnrolled: "2022-06-10",
        subjects: [
            { name: "Science", code: "SCI101", q1: 92, q2: 94, q3: 90, q4: 96 },
            { name: "Mathematics", code: "MATH101", q1: 88, q2: 85, q3: 90, q4: 87 },
            { name: "Filipino", code: "FIL101", q1: 78, q2: 80, q3: 82, q4: 79 }
        ]
    }
];

async function main() {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        // ---------- 1. find or create the test student ----------
        const [existing] = await connection.query<mysql.RowDataPacket[]>(
            "SELECT id FROM students WHERE lrn = ? LIMIT 1",
            [TEST_LRN]
        );
        let studentId: number;
        if (existing.length > 0) {
            studentId = Number(existing[0].id);
            console.log(`Using existing test student id=${studentId} (lrn ${TEST_LRN}).`);
        } else {
            const hash = await bcrypt.hash("password123", 10);
            const [userRes] = await connection.execute<ResultSetHeader>(
                "INSERT INTO users(email, password, role) VALUES(?,?,?)",
                [TEST_EMAIL, hash, "student"]
            );
            const [studentRes] = await connection.execute<ResultSetHeader>(
                `INSERT INTO students (userId, email, lrn, firstname, middlename, lastname, suffix, birthdate, sex, status)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    userRes.insertId,
                    TEST_EMAIL,
                    TEST_LRN,
                    "PDF",
                    "Test",
                    "Student",
                    null,
                    "2007-02-14",
                    "Male",
                    "active"
                ]
            );
            studentId = studentRes.insertId;
            console.log(`Created test student id=${studentId} (lrn ${TEST_LRN}).`);
        }

        // ---------- 2. wipe this student's rows in the 4 target years ----------
        const targetYears = YEARS.map((y) => y.schoolYearId);
        const [oldEnrollments] = await connection.query<mysql.RowDataPacket[]>(
            `SELECT id FROM enrollments WHERE studentId = ? AND schoolYearId IN (${targetYears.join(",")})`,
            [studentId]
        );
        const oldEnrollmentIds = oldEnrollments.map((r) => Number(r.id));
        if (oldEnrollmentIds.length > 0) {
            const inClause = oldEnrollmentIds.join(",");
            await connection.query(
                `DELETE FROM student_academic_record_subjects
                 WHERE recordId IN (SELECT id FROM student_academic_records WHERE enrollmentId IN (${inClause}))`
            );
            await connection.query(
                `DELETE FROM student_academic_records WHERE enrollmentId IN (${inClause})`
            );
            await connection.query(`DELETE FROM enrollment_details WHERE enrollmentId IN (${inClause})`);
            await connection.query(`DELETE FROM enrollments WHERE id IN (${inClause})`);
            console.log(`Cleared ${oldEnrollmentIds.length} previous enrollment(s) for the test student.`);
        }

        // ---------- 3. insert the 4 years of history ----------
        for (const year of YEARS) {
            const [enrRes] = await connection.execute<ResultSetHeader>(
                "INSERT INTO enrollments (dateEnrolled, classId, schoolYearId, studentId) VALUES (?, ?, ?, ?)",
                [year.dateEnrolled, year.classId, year.schoolYearId, studentId]
            );
            const enrollmentId = enrRes.insertId;

            const [recRes] = await connection.execute<ResultSetHeader>(
                `INSERT INTO student_academic_records (enrollmentId, classSection, classGradeLevel, adviserName)
                 VALUES (?, ?, ?, ?)`,
                [enrollmentId, year.section, year.gradeLevel, year.adviserName]
            );
            const recordId = recRes.insertId;

            for (const subject of year.subjects) {
                await connection.execute<ResultSetHeader>(
                    `INSERT INTO student_academic_record_subjects
                        (recordId, subjectName, subjectCode, q1, q2, q3, q4)
                     VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [recordId, subject.name, subject.code, subject.q1, subject.q2, subject.q3, subject.q4]
                );
            }
            console.log(
                `  ${year.section.padEnd(16)} ${year.dateEnrolled.slice(0, 4)}-${Number(year.dateEnrolled.slice(0, 4)) + 1}  ` +
                `enrollment=${enrollmentId} record=${recordId} subjects=${year.subjects.length}`
            );
        }

        await connection.commit();
        console.log("\nDone. Test the PDF with:");
        console.log(`  GET /api/student-records/${studentId}/pdf   (login as admin)`);
    } catch (err) {
        await connection.rollback();
        throw err;
    } finally {
        connection.release();
        await pool.end();
    }
}

main().catch((err) => {
    console.error("SEED FAILED:", err);
    process.exit(1);
});
