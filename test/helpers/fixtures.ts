import type { PoolConnection } from "mysql2/promise";

import { insert } from "./db.js";

/**
 * Self-contained fixtures for the phase-1 tests.
 *
 * Every scenario is a private classroom + subject + teacher + student +
 * enrollment (its own school year), so tests never depend on — or disturb —
 * the seeded demo rows. `teardownScenario` removes everything it created in
 * FK-safe order, including the frozen snapshot rows.
 */

let sequence = 0;

export interface Scenario {
    suffix: string;
    userId: number;
    studentId: number;
    enrollmentId: number;
    classroomId: number;
    section: string;
    gradeLevel: number;
    teacherUserId: number;
    teacherId: number;
    adviserName: string;
    subjectId: number;
    subjectName: string;
    subjectCode: string;
    classSubjectId: number;
    schoolYearId: number;
    startYear: string;
    endYear: string;
    assessmentId: number;
    recordId: number | null;
}

async function nextUserId(connection: PoolConnection, email: string, role: string): Promise<number> {
    return insert(connection, "INSERT INTO users(email, password, role, status) VALUES(?,?,?,?)", [
        email,
        "test-hash",
        role,
        "active",
    ]);
}

/**
 * Creates a classroom with one teacher/subject, one enrolled student,
 * one assessment with a score, and attendance — i.e. everything the semester-end
 * cleanup deletes.
 */
export async function createScenario(connection: PoolConnection): Promise<Scenario> {
    sequence += 1;
    const suffix = `${Date.now().toString(36)}${sequence}`;
    const short = suffix.slice(-10);
    const section = `T${short}`.slice(0, 20);
    const gradeLevel = 7;

    const teacherEmail = `t.${suffix}@test.local`;
    const teacherUserId = await nextUserId(connection, teacherEmail, "teacher");
    const teacherId = await insert(
        connection,
        "INSERT INTO teachers(email, firstname, middlename, lastname, userId) VALUES(?,?,?,?,?)",
        [teacherEmail, "Test", "T", `Teacher${short}`, teacherUserId]
    );

    const studentEmail = `s.${suffix}@test.local`;
    const studentUserId = await nextUserId(connection, studentEmail, "student");
    const studentId = await insert(
        connection,
        `INSERT INTO students(userId, email, lrn, firstname, middlename, lastname, sex, status)
         VALUES(?,?,?,?,?,?,?,?)`,
        [studentUserId, studentEmail, `9${short}`.slice(0, 20), "Test", "S", `Student${short}`, "Male", "active"]
    );

    const startYear = `21${short.slice(0, 2)}`;
    const endYear = `22${short.slice(0, 2)}`;
    const schoolYearId = await insert(
        connection,
        "INSERT INTO schoolyear(startYear, endYear, isActive) VALUES(?,?,0)",
        [startYear, endYear]
    );

    const classroomId = await insert(
        connection,
        "INSERT INTO classrooms(section, gradeLevel, status) VALUES(?,?, 'active')",
        [section, gradeLevel]
    );

    const subjectName = `TS-${short}`.slice(0, 20);
    const subjectCode = `TSC${short}`;
    const subjectId = await insert(
        connection,
        "INSERT INTO subjects(name, code, unit, hasComponents) VALUES(?,?,?,0)",
        [subjectName, subjectCode, 3]
    );

    const classSubjectId = await insert(
        connection,
        "INSERT INTO class_subjects(classId, teacherId, subjectId) VALUES(?,?,?)",
        [classroomId, teacherId, subjectId]
    );

    const enrollmentId = await insert(
        connection,
        "INSERT INTO enrollments(classId, schoolYearId, studentId, status) VALUES(?,?,?, 'enrolled')",
        [classroomId, schoolYearId, studentId]
    );

    await insert(connection, "INSERT INTO enrollment_details(enrollmentId, subjectId) VALUES(?,?)", [
        enrollmentId,
        subjectId,
    ]);
    await insert(connection, "INSERT INTO class_students(classId, enrollmentId) VALUES(?,?)", [
        classroomId,
        enrollmentId,
    ]);

    const assessmentId = await insert(
        connection,
        `INSERT INTO assessments(classSubjectId, quarter, type, title, maxScore)
         VALUES(?, 1, 'written_work', ?, 20.00)`,
        [classSubjectId, `Quiz ${short}`]
    );
    await insert(connection, "INSERT INTO student_scores(assessmentId, enrollmentId, score) VALUES(?,?,?)", [
        assessmentId,
        enrollmentId,
        18.0,
    ]);

    await insert(
        connection,
        "INSERT INTO class_daily_attendance(classId, enrollmentId, date, status, quarter) VALUES(?,?,CURDATE(),'present',1)",
        [classroomId, enrollmentId]
    );
    await insert(
        connection,
        `INSERT INTO student_attendance(classSubjectId, enrollmentId, status, quarter, date)
         VALUES(?,?,'present',1,CURDATE())`,
        [classSubjectId, enrollmentId]
    );

    return {
        suffix,
        userId: studentUserId,
        studentId,
        enrollmentId,
        classroomId,
        section,
        gradeLevel,
        teacherUserId,
        teacherId,
        adviserName: `Snap Adviser ${short}`.slice(0, 50),
        subjectId,
        subjectName,
        subjectCode,
        classSubjectId,
        schoolYearId,
        startYear,
        endYear,
        assessmentId,
        recordId: null,
    };
}

export interface FinalizeOptions {
    /** Number of quarters to freeze as 'submitted' (defaults to all configured). */
    quarters: number;
    /** When false, no subject grade rows are written (simulates a partial snapshot). */
    withSubjects?: boolean;
    /** When true, subject rows are written with NULL grades (row exists, no grade). */
    nullGrades?: boolean;
    /** Adviser name frozen into the record (defaults to scenario.adviserName). */
    adviserName?: string;
}

/**
 * Writes the frozen academic record exactly like the submit workflow does:
 * record header + subject grade rows + the per-quarter submission ledger.
 */
export async function finalizeScenario(
    connection: PoolConnection,
    scenario: Scenario,
    options: FinalizeOptions
): Promise<number> {
    const adviserName = options.adviserName ?? scenario.adviserName;
    const recordId = await insert(
        connection,
        `INSERT INTO student_academic_records(enrollmentId, classSection, classGradeLevel, adviserName)
         VALUES(?,?,?,?)`,
        [scenario.enrollmentId, scenario.section, scenario.gradeLevel, adviserName]
    );
    scenario.recordId = recordId;

    if (options.withSubjects !== false) {
        const grades: (number | null)[] = options.nullGrades
            ? [null, null, null, null]
            : [88.0, 89.0, 90.0, 91.0];
        await insert(
            connection,
            `INSERT INTO student_academic_record_subjects
                (recordId, subjectName, subjectCode, q1, q2, q3, q4)
             VALUES(?,?,?,?,?,?,?)`,
            [
                recordId,
                scenario.subjectName,
                scenario.subjectCode,
                grades[0] ?? null,
                grades[1] ?? null,
                grades[2] ?? null,
                grades[3] ?? null,
            ]
        );
    }

    for (let quarter = 1; quarter <= options.quarters; quarter += 1) {
        await insert(
            connection,
            `INSERT INTO student_academic_record_quarters(recordId, quarter, status, submittedAt, submittedBy)
             VALUES(?,?,'submitted',NOW(),?)`,
            [recordId, quarter, scenario.teacherId]
        );
    }

    return recordId;
}

/** Removes every row created by createScenario/finalizeScenario (FK-safe order). */
export async function teardownScenario(connection: PoolConnection, scenario: Scenario): Promise<void> {
    const { enrollmentId, classroomId, classSubjectId, subjectId, schoolYearId } = scenario;

    if (scenario.recordId !== null) {
        await connection.execute(
            "DELETE FROM student_academic_record_components WHERE subjectRowId IN (SELECT id FROM student_academic_record_subjects WHERE recordId = ?)",
            [scenario.recordId]
        );
        await connection.execute("DELETE FROM student_academic_record_subjects WHERE recordId = ?", [
            scenario.recordId,
        ]);
        await connection.execute("DELETE FROM student_academic_record_quarters WHERE recordId = ?", [
            scenario.recordId,
        ]);
        await connection.execute("DELETE FROM student_academic_records WHERE id = ?", [scenario.recordId]);
    }

    await connection.execute("DELETE FROM student_scores WHERE enrollmentId = ?", [enrollmentId]);
    await connection.execute("DELETE FROM student_attendance WHERE enrollmentId = ?", [enrollmentId]);
    await connection.execute("DELETE FROM class_daily_attendance WHERE enrollmentId = ?", [enrollmentId]);
    await connection.execute("DELETE FROM enrollment_details WHERE enrollmentId = ?", [enrollmentId]);
    await connection.execute("DELETE FROM class_students WHERE enrollmentId = ?", [enrollmentId]);
    await connection.execute("DELETE FROM enrollments WHERE id = ?", [enrollmentId]);

    await connection.execute("DELETE FROM assessments WHERE classSubjectId = ?", [classSubjectId]);
    await connection.execute("DELETE FROM grading_weights WHERE classSubjectId = ?", [classSubjectId]);
    await connection.execute("DELETE FROM class_teacher WHERE classId = ?", [classroomId]);
    await connection.execute("DELETE FROM class_subjects WHERE id = ?", [classSubjectId]);
    await connection.execute("DELETE FROM classrooms WHERE id = ?", [classroomId]);
    await connection.execute("DELETE FROM teacher_subject_assignment WHERE subjectId = ?", [subjectId]);
    await connection.execute("DELETE FROM subject_components WHERE parentSubjectId = ?", [subjectId]);
    await connection.execute("DELETE FROM subjects WHERE id = ?", [subjectId]);
    await connection.execute("DELETE FROM schoolyear WHERE id = ?", [schoolYearId]);
    await connection.execute("DELETE FROM teachers WHERE id = ?", [scenario.teacherId]);
    await connection.execute("DELETE FROM students WHERE id = ?", [scenario.studentId]);
    await connection.execute("DELETE FROM users WHERE id IN (?, ?)", [scenario.userId, scenario.teacherUserId]);
}
