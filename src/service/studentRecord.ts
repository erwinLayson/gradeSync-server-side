import { getDBPoolConnection } from "../config/database.js";
import puppeteer from "puppeteer";
import ejs from "ejs"

import StudentRecordModel from "../model/studentRecord.js";
import ClassroomModel from "../model/classrooms.js";

// Reuse existing services
import { getStudentByClassroomIdService, getStudentByIdService } from "./students.js";
import { getGradeBookDetailsByClassSubjectIdService } from "./gradebook.js";
import { getTeacherByUserIdService, getTeacherByIdService } from "./teachers.js";
import { getClassAdviserService, getClassroomByIdService } from "./classrooms.js";
import {getAllEnrollmentRecordByStudentId} from "./enrollments.js";


import type { PoolConnection } from "mysql2/promise";
import { ConflictError, ForbiddenError, NotFoundError } from "../middleware/errors.js";

import type {
    BlockedStudent,
    ClassRecordsResponse,
    ClassRecordSubject,
    QuarterSubmissionRow,
    StudentAcademicRecordRow,
    StudentClassRecordRow,
    StudentRecordPdfEntry,
    StudentRecordPdfSubject,
    StudentSubjectGrade,
    SubmissionSummaryRow,
    SubmitAllResult
} from "../constant/studentRecord.js";

// ==================== helpers ====================

// The teachers.id for the logged-in teacher account (throws when none exists).
export async function resolveTeacherIdByUserIdService(userId: number): Promise<number> {
    const teacher = await getTeacherByUserIdService(userId);
    return teacher.id;
}

// teacherId === null means the caller is an admin (adviser-scope check skipped).
async function assertAdviserOfClass(connection: PoolConnection, classId: number, teacherId: number | null): Promise<void> {
    if (teacherId === null) {
        return;
    }
    const classroomModel = new ClassroomModel(connection);
    const adviserClassId = await classroomModel.getClassIdByAdviser(teacherId);
    if (adviserClassId !== classId) {
        throw new ForbiddenError("You are not the class adviser of this class");
    }
}

// The class a teacher advises (for GET /student-records/my-class).
export async function getAdvisedClassIdService(teacherId: number): Promise<number> {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        const classroomModel = new ClassroomModel(connection);
        const classId = await classroomModel.getClassIdByAdviser(teacherId);
        if (classId === null) {
            throw new NotFoundError("You are not assigned as a class adviser", 404);
        }
        return classId;
    } finally {
        connection.release();
    }
}

function normalizeSubmissionDate(submittedAt: Date | string | null): string | null {
    if (submittedAt === null) {
        return null;
    }
    return new Date(submittedAt).toISOString();
}

// One student's computed grades across the class's subjects (find-per-subject).
async function computeStudentGrades(
    subjects: ClassRecordSubject[],
    enrollmentId: number,
    quarter: number
): Promise<Map<number, number | null>> {
    const bySubject = new Map<number, number | null>();
    for (const subject of subjects) {
        const gradebook = await getGradeBookDetailsByClassSubjectIdService(subject.classSubjectId, quarter);
        const row = gradebook.student.find((s) => s.enrollmentId === enrollmentId);
        bySubject.set(subject.subjectId, row?.quarterGrade ?? null);
    }
    return bySubject;
}

// Whole-class computed grades: enrollmentId -> (subjectId -> grade|null).
async function computeClassGradeMatrix(
    subjects: ClassRecordSubject[],
    quarter: number
): Promise<Map<number, Map<number, number | null>>> {
    const matrix = new Map<number, Map<number, number | null>>();
    for (const subject of subjects) {
        const gradebook = await getGradeBookDetailsByClassSubjectIdService(subject.classSubjectId, quarter);
        for (const row of gradebook.student) {
            let bySubject = matrix.get(row.enrollmentId);
            if (!bySubject) {
                bySubject = new Map();
                matrix.set(row.enrollmentId, bySubject);
            }
            bySubject.set(subject.subjectId, row.quarterGrade);
        }
    }
    return matrix;
}

// The class's subjects a specific enrollment actually takes (E7).
async function getEnrolledSubjectIds(
    recordModel: StudentRecordModel,
    subjects: ClassRecordSubject[],
    enrollmentId: number
): Promise<number[]> {
    const classSubjectIds = new Set(subjects.map((s) => s.subjectId));
    const rows = await recordModel.getEnrollmentSubjectIds([enrollmentId]);
    return rows
        .filter((r) => r.enrollmentId === enrollmentId && classSubjectIds.has(r.subjectId))
        .map((r) => r.subjectId);
}

// Writes the frozen record for one student inside the caller's transaction.
// Throws ConflictError (E2) when an enrolled subject has no computed grade yet.
async function freezeRecordWithin(
    connection: PoolConnection,
    enrollmentId: number,
    quarter: number,
    submittedBy: number | null,
    adviserName: string,
    classSection: string,
    classGradeLevel: number,
    subjects: ClassRecordSubject[],
    computed: Map<number, number | null>
): Promise<void> {
    const recordModel = new StudentRecordModel(connection);

    const enrolledSubjectIds = await getEnrolledSubjectIds(recordModel, subjects, enrollmentId);
    const missingSubjectIds = enrolledSubjectIds.filter((subjectId) => computed.get(subjectId) == null);
    if (missingSubjectIds.length > 0) {
        const names = subjects.filter((s) => missingSubjectIds.includes(s.subjectId)).map((s) => s.subjectName);
        throw new ConflictError(`Record cannot be submitted: no grade yet for ${names.join(", ")}`);
    }

    let record = await recordModel.getRecordByEnrollmentId(enrollmentId);
    if (!record) {
        const recordId = await recordModel.createRecord({
            enrollmentId,
            classSection,
            classGradeLevel,
            adviserName
        });
        record = {
            id: recordId,
            enrollmentId,
            classSection,
            classGradeLevel,
            adviserName
        };
    }

    for (const subjectId of enrolledSubjectIds) {
        const grade = computed.get(subjectId);
        if (grade === null || grade === undefined) {
            continue; // guarded by the E2 check above, but stay safe
        }
        // Snapshot the subject's name/code at freeze time — the record must stay
        // readable (and immutable) even if the subject is later renamed/deleted.
        const subject = subjects.find((s) => s.subjectId === subjectId);
        if (!subject) {
            continue;
        }
        await recordModel.upsertSubjectQuarterGrade(record.id, subject.subjectName, subject.subjectCode, quarter, grade);
    }

    await recordModel.upsertQuarterSubmission(record.id, quarter, submittedBy);
}

// Who "signs" the submission (submittedBy + adviserName snapshot on the record).
async function resolveSubmitter(classId: number, teacherId: number | null): Promise<{ submittedBy: number | null; adviserName: string }> {
    if (teacherId !== null) {
        const teacher = await getTeacherByIdService(teacherId);
        return { submittedBy: teacher.id, adviserName: teacher.fullname };
    }
    const adviser = await getClassAdviserService(classId);
    return { submittedBy: adviser.adviserId, adviserName: adviser.adviserFullname ?? "" };
}

// ==================== class records view ====================

// Roster + per-subject grades + submission status for one class and quarter.
// Display rule: submitted quarters show the frozen qN, pending show live values.
export async function getClassRecordsService(classId: number, quarter: number, teacherId: number | null): Promise<ClassRecordsResponse> {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        await assertAdviserOfClass(connection, classId, teacherId);

        const classroom = await getClassroomByIdService(classId, connection);
        if (!classroom) {
            throw new NotFoundError("Classroom not found", 404);
        }
        const adviser = await getClassAdviserService(classId);

        const recordModel = new StudentRecordModel(connection);
        const subjects = await recordModel.getClassSubjects(classId);
        const roster = await getStudentByClassroomIdService(classId, connection);
        const enrollmentIds = roster.map((s) => s.enrollmentId);

        const computedMatrix = await computeClassGradeMatrix(subjects, quarter);

        // Enrolled subjects per enrollment (E7).
        const enrolledRows = await recordModel.getEnrollmentSubjectIds(enrollmentIds);
        const classSubjectIds = new Set(subjects.map((s) => s.subjectId));
        const enrolledByEnrollment = new Map<number, Set<number>>();
        for (const row of enrolledRows) {
            if (!classSubjectIds.has(row.subjectId)) {
                continue;
            }
            let set = enrolledByEnrollment.get(row.enrollmentId);
            if (!set) {
                set = new Set();
                enrolledByEnrollment.set(row.enrollmentId, set);
            }
            set.add(row.subjectId);
        }

        // Frozen grades + submission state.
        const records = await recordModel.getRecordsByEnrollmentIds(enrollmentIds);
        const recordByEnrollment = new Map<number, StudentAcademicRecordRow>();
        for (const record of records) {
            recordByEnrollment.set(record.enrollmentId, record);
        }
        const recordIds = records.map((r) => r.id);

        const storedByRecord = new Map<number, Map<string, number | null>>();
        const subjectRows = await recordModel.getSubjectRowsByRecordIds(recordIds);
        for (const row of subjectRows) {
            let bySubject = storedByRecord.get(row.recordId);
            if (!bySubject) {
                bySubject = new Map();
                storedByRecord.set(row.recordId, bySubject);
            }
            const column: number | null = quarter === 1 ? row.q1 : quarter === 2 ? row.q2 : quarter === 3 ? row.q3 : row.q4;
            bySubject.set(row.subjectName, column === null ? null : Number(column));
        }

        const submissionByRecord = new Map<number, QuarterSubmissionRow>();
        const submissions = await recordModel.getSubmissionsByRecordIds(recordIds, quarter);
        for (const submission of submissions) {
            submissionByRecord.set(submission.recordId, submission);
        }

        const students: StudentClassRecordRow[] = roster.map((student) => {
            const record = recordByEnrollment.get(student.enrollmentId);
            const submission = record ? submissionByRecord.get(record.id) : undefined;
            const isSubmitted = submission?.status === "submitted";
            const stored = record ? storedByRecord.get(record.id) : undefined;

            const subjectGrades: StudentSubjectGrade[] = subjects.map((subject) => {
                const enrolled = enrolledByEnrollment.get(student.enrollmentId)?.has(subject.subjectId) ?? false;
                let grade: number | null = null;
                let source: "computed" | "frozen" = "computed";
                if (isSubmitted) {
                    const frozen = stored?.get(subject.subjectName);
                    grade = frozen === undefined ? null : frozen;
                    source = "frozen";
                } else {
                    grade = computedMatrix.get(student.enrollmentId)?.get(subject.subjectId) ?? null;
                }
                return { subjectId: subject.subjectId, enrolled, grade, source };
            });

            return {
                enrollmentId: student.enrollmentId,
                studentId: student.studentId,
                studentLrn: student.studentLrn,
                fullname: student.fullname,
                studentSex: student.studentSex,
                status: isSubmitted ? "submitted" : "pending",
                submittedAt: submission ? normalizeSubmissionDate(submission.submittedAt) : null,
                recordId: record?.id ?? null,
                subjects: subjectGrades
            };
        });

        const submitted = students.filter((s) => s.status === "submitted").length;

        return {
            classId,
            section: classroom.section,
            gradeLevel: classroom.gradeLevel,
            adviserId: adviser.adviserId,
            adviserFullname: adviser.adviserFullname,
            quarter,
            subjects,
            students,
            progress: { total: students.length, submitted, pending: students.length - submitted }
        };
    } finally {
        connection.release();
    }
}

// ==================== submit / submit-all / reopen ====================

export async function submitStudentRecordService(
    classId: number,
    enrollmentId: number,
    quarter: number,
    teacherId: number | null
): Promise<{ recordId: number; status: "submitted" }> {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        await assertAdviserOfClass(connection, classId, teacherId);

        const classroom = await getClassroomByIdService(classId, connection);
        if (!classroom) {
            throw new NotFoundError("Classroom not found", 404);
        }
        const roster = await getStudentByClassroomIdService(classId, connection);
        if (!roster.some((s) => s.enrollmentId === enrollmentId)) {
            throw new NotFoundError("Student is not enrolled in this class", 404);
        }

        const recordModel = new StudentRecordModel(connection);
        const subjects = await recordModel.getClassSubjects(classId);
        const computed = await computeStudentGrades(subjects, enrollmentId, quarter);
        const { submittedBy, adviserName } = await resolveSubmitter(classId, teacherId);

        await connection.beginTransaction();
        try {
            await freezeRecordWithin(
                connection,
                enrollmentId,
                quarter,
                submittedBy,
                adviserName,
                classroom.section,
                classroom.gradeLevel,
                subjects,
                computed
            );
            await connection.commit();
        } catch (err) {
            await connection.rollback();
            throw err;
        }

        const record = await recordModel.getRecordByEnrollmentId(enrollmentId);
        return { recordId: record?.id ?? 0, status: "submitted" };
    } finally {
        connection.release();
    }
}

export async function submitAllStudentRecordsService(classId: number, quarter: number, teacherId: number | null): Promise<SubmitAllResult> {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        await assertAdviserOfClass(connection, classId, teacherId);

        const classroom = await getClassroomByIdService(classId, connection);
        if (!classroom) {
            throw new NotFoundError("Classroom not found", 404);
        }

        const recordModel = new StudentRecordModel(connection);
        const subjects = await recordModel.getClassSubjects(classId);
        const roster = await getStudentByClassroomIdService(classId, connection);
        const enrollmentIds = roster.map((s) => s.enrollmentId);

        // Students already submitted for this quarter are skipped.
        const records = await recordModel.getRecordsByEnrollmentIds(enrollmentIds);
        const recordByEnrollment = new Map(records.map((r) => [r.enrollmentId, r]));
        const submissions = await recordModel.getSubmissionsByRecordIds(records.map((r) => r.id), quarter);
        const submittedEnrollmentIds = new Set<number>();
        for (const submission of submissions) {
            const record = recordByEnrollment.get(submission.recordId);
            if (record && submission.status === "submitted") {
                submittedEnrollmentIds.add(record.enrollmentId);
            }
        }

        const pending = roster.filter((s) => !submittedEnrollmentIds.has(s.enrollmentId));
        const computedMatrix = await computeClassGradeMatrix(subjects, quarter);
        const { submittedBy, adviserName } = await resolveSubmitter(classId, teacherId);

        const blocked: BlockedStudent[] = [];
        let submittedCount = 0;

        await connection.beginTransaction();
        try {
            for (const student of pending) {
                const computed = computedMatrix.get(student.enrollmentId) ?? new Map();
                try {
                    await freezeRecordWithin(
                        connection,
                        student.enrollmentId,
                        quarter,
                        submittedBy,
                        adviserName,
                        classroom.section,
                        classroom.gradeLevel,
                        subjects,
                        computed
                    );
                    submittedCount++;
                } catch (err) {
                    if (err instanceof ConflictError) {
                        // E2: not fully graded — report and continue (E9). DB errors
                        // still propagate and roll back the whole batch.
                        const enrolledSubjectIds = await getEnrolledSubjectIds(recordModel, subjects, student.enrollmentId);
                        const missingSubjects = enrolledSubjectIds
                            .filter((subjectId) => computed.get(subjectId) == null)
                            .map((subjectId) => subjects.find((s) => s.subjectId === subjectId)?.subjectName ?? `Subject #${subjectId}`);
                        blocked.push({ enrollmentId: student.enrollmentId, fullname: student.fullname, missingSubjects });
                    } else {
                        throw err;
                    }
                }
            }
            await connection.commit();
        } catch (err) {
            await connection.rollback();
            throw err;
        }

        return { submitted: submittedCount, alreadySubmitted: submittedEnrollmentIds.size, blocked };
    } finally {
        connection.release();
    }
}

export async function reopenStudentRecordService(
    classId: number,
    enrollmentId: number,
    quarter: number,
    teacherId: number | null
): Promise<{ status: "pending" }> {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        await assertAdviserOfClass(connection, classId, teacherId);

        const roster = await getStudentByClassroomIdService(classId, connection);
        if (!roster.some((s) => s.enrollmentId === enrollmentId)) {
            throw new NotFoundError("Student is not enrolled in this class", 404);
        }

        const recordModel = new StudentRecordModel(connection);
        const record = await recordModel.getRecordByEnrollmentId(enrollmentId);
        if (!record) {
            throw new NotFoundError("No student record found for this student", 404);
        }
        const reopened = await recordModel.reopenQuarterSubmission(record.id, quarter);
        if (!reopened) {
            throw new ConflictError("Record is not currently submitted for this quarter");
        }
        return { status: "pending" };
    } finally {
        connection.release();
    }
}

// ==================== admin summary ====================

export async function getSubmissionSummaryService(schoolYearId?: number): Promise<SubmissionSummaryRow[]> {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        const recordModel = new StudentRecordModel(connection);
        let yearId = schoolYearId;
        if (yearId === undefined) {
            const activeId = await recordModel.getActiveSchoolYearId();
            if (activeId === null) {
                return [];
            }
            yearId = activeId;
        }

        const classRows = await recordModel.getSubmissionSummary(yearId);
        const countRows = await recordModel.getSubmittedCountsByClass(yearId);

        const countsByClass = new Map<number, Record<number, number>>();
        for (const row of countRows) {
            let counts = countsByClass.get(row.classId);
            if (!counts) {
                counts = {};
                countsByClass.set(row.classId, counts);
            }
            counts[row.quarter] = Number(row.submittedCount);
        }

        return classRows.map((row) => ({
            classId: row.classId,
            section: row.section,
            gradeLevel: row.gradeLevel,
            adviserId: row.adviserId,
            adviserFullname: row.adviserFullname,
            totalStudents: Number(row.totalStudents) || 0,
            submitted: countsByClass.get(row.classId) ?? {}
        }));
    } finally {
        connection.release();
    }
}

// ==================== enforcement ====================

// Hard enforcement: blocks advancing the quarter until every active-school-year
// enrollment has a submitted record for `quarter` and every class has an adviser.
// Called from the academic-settings service before an advance is applied.
export async function assertQuarterCompleteService(quarter: number, existingConnection?: PoolConnection): Promise<void> {
    const pool = getDBPoolConnection();
    const connection = existingConnection ?? await pool.getConnection();
    const ownConnection = !existingConnection;
    try {
        const recordModel = new StudentRecordModel(connection);
        const schoolYearId = await recordModel.getActiveSchoolYearId();
        if (schoolYearId === null) {
            return; // no active school year → nothing to enforce
        }

        const withoutAdviser = await recordModel.getClassesWithoutAdviser(schoolYearId);
        const incomplete = await recordModel.getIncompleteClasses(quarter, schoolYearId);

        if (withoutAdviser.length === 0 && incomplete.length === 0) {
            return;
        }

        const problems: string[] = [];
        for (const cls of incomplete) {
            problems.push(`${cls.section} (${cls.submitted} of ${cls.total} students submitted)`);
        }
        for (const cls of withoutAdviser) {
            problems.push(`${cls.section} has no assigned class adviser`);
        }
        throw new ConflictError(
            `Cannot advance the quarter: ${problems.join("; ")}. Submit all student records first.`
        );
    } finally {
        if (ownConnection) {
            connection.release();
        }
    }
}


// All of a student's frozen records across school years, ready for the SF10
// PDF: per-enrollment record snapshots (section / grade / adviser / school year)
// plus the frozen per-subject grades. teacherId === null means an admin (no
// scope check); a teacher may only print students enrolled in their advised
// class, so a random teacher can't pull another class's records.
export async function StudentRecordPDFDetailsService(studentId: number) {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();

    // DepEd convention: 75 is the passing mark for the final rating.
    const PASSING_GRADE = 75;
    try {
        // Fail fast on an unknown student before doing any further work.
        const student = await getStudentByIdService(studentId, connection);

        const studentRecordModel = new StudentRecordModel(connection);

        const studentEnrollmentRecord = await getAllEnrollmentRecordByStudentId(studentId, connection);
        const enrollmentIds = studentEnrollmentRecord.map((e) => e.enrollmentId);

        // Frozen record headers (classSection / classGradeLevel / adviserName) and
        // the frozen per-subject grades, both keyed by record id.
        const recordRows = await studentRecordModel.getRecordsByEnrollmentIds(enrollmentIds);
        const recordIds = recordRows.map((r) => r.id);
        const subjectRows = await studentRecordModel.getSubjectRowsByRecordIds(recordIds);

        const subjectsByRecord = new Map<number, StudentRecordPdfSubject[]>();
        for (const row of subjectRows) {
            const quarters = [row.q1, row.q2, row.q3, row.q4];
            const present = quarters.filter((q): q is number => q !== null && q !== undefined);
            const finalRating =
                present.length > 0
                    ? Math.round((present.reduce((a, b) => a + Number(b), 0) / present.length) * 100) / 100
                    : null;
            const remarks = finalRating === null ? "" : finalRating >= PASSING_GRADE ? "Passed" : "Failed";

            const list = subjectsByRecord.get(row.recordId) ?? [];
            list.push({
                subjectName: row.subjectName,
                subjectCode: row.subjectCode,
                q1: row.q1 === null ? null : Number(row.q1),
                q2: row.q2 === null ? null : Number(row.q2),
                q3: row.q3 === null ? null : Number(row.q3),
                q4: row.q4 === null ? null : Number(row.q4),
                finalRating,
                remarks
            });
            subjectsByRecord.set(row.recordId, list);
        }

        const recordByEnrollment = new Map(recordRows.map((r) => [r.enrollmentId, r]));

        const academicRecord: StudentRecordPdfEntry[] = studentEnrollmentRecord.map((enrollment) => {
            const record = recordByEnrollment.get(enrollment.enrollmentId);
            return {
                enrollmentId: enrollment.enrollmentId,
                schoolYear: enrollment.schoolYear,
                recordId: record?.id ?? null,
                classSection: record?.classSection ?? null,
                classGradeLevel: record?.classGradeLevel ?? null,
                adviserName: record?.adviserName ?? null,
                subjects: record ? (subjectsByRecord.get(record.id) ?? []) : [],
            };
        });

        const sem1 = academicRecord.slice(0, 2);
        const sem2 = academicRecord.slice(2);

        return { student, academicRecord: {semester1: sem1, semester2: sem2} };
    } finally {
        connection.release();
    }
}
