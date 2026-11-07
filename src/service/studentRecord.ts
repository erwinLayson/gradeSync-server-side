import { getDBPoolConnection } from "../config/database.js";

import StudentRecordModel from "../model/studentRecord.js";
import ClassroomModel from "../model/classrooms.js";
import AcademicSettingsModel from "../model/academicSettings.js";
import ClassSubjectSubmissionModel from "../model/classSubjectSubmission.js";
import AmendmentPermissionModel from "../model/amendmentPermission.js";
import AmendmentRequestModel from "../model/amendmentRequest.js";
import AmendmentAuditModel from "../model/amendmentAudit.js";

// Reuse existing services
import { getStudentByClassroomIdService, getStudentByIdService } from "./students.js";
import { getGradeBookDetailsByClassSubjectIdService } from "./gradebook.js";
import { getFacultyByUserIdService } from "./faculties.js";
import { getClassAdviserService, getClassroomByIdService } from "./classrooms.js";
import {getAllEnrollmentRecordByStudentId} from "./enrollments.js";

// Helpers
import { computeClassGradeMatrix } from "../helper/computeClassGradeMatrix.js";
import type { ComputedSubjectGrade } from "../helper/computeClassGradeMatrix.js";
import { resolveSubmitter } from "../helper/resolveSubmitter.js";
import { calculateFinalGrade } from "../helper/calculateFinalGrade.js";
import { computeGeneralAverage } from "../helper/computeGeneralAverage.js";
import { getRemarks } from "../helper/getRemarks.js";
import { getNumQuarters } from "./academicSettings.js";

import type { PoolConnection } from "mysql2/promise";
import { ConflictError, ForbiddenError, NotFoundError } from "../middleware/errors.js";

import type {
    BlockedStudent,
    ClassRecordsResponse,
    ClassRecordSubject,
    QuarterSubmissionRow,
    StudentAcademicRecordRow,
    StudentAcademicRecordSubjectRow,
    StudentClassRecordRow,
    StudentRecordPdfEntry,
    StudentRecordPdfSubject,
    StudentSubjectGrade,
    SubmissionSummaryRow,
    SubmitAllResult,
    ClassSubjectSubmissionRow,
    QuarterSubmissionStatus,
    TeacherSubjectOption,
    SubjectClassRecordResponse,
    SubjectStudentRow,
    SubjectSubmissionSummaryRow
} from "../constant/studentRecord.js";

// ==================== helpers ====================

export async function resolveFacultyIdByUserIdService(userId: number): Promise<number> {
    const faculty = await getFacultyByUserIdService(userId);
    return faculty.id;
}

async function assertAdviserOfClass(connection: PoolConnection, classId: number, facultyId: number | null): Promise<void> {
    if (facultyId === null) {
        return;
    }
    const classroomModel = new ClassroomModel(connection);
    const adviserClassId = await classroomModel.getClassIdByAdviser(facultyId);
    if (adviserClassId !== classId) {
        throw new ForbiddenError("You are not the class adviser of this class");
    }
}

export async function getAdvisedClassIdService(facultyId: number): Promise<number | null> {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        const classroomModel = new ClassroomModel(connection);
        const classId = await classroomModel.getClassIdByAdviser(facultyId);
        if (classId === null) {
            return null
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

async function computeStudentGrades(
    subjects: ClassRecordSubject[],
    enrollmentId: number,
    quarter: number
): Promise<Map<number, ComputedSubjectGrade>> {
    const bySubject = new Map<number, ComputedSubjectGrade>();
    for (const subject of subjects) {
        const gradebook = await getGradeBookDetailsByClassSubjectIdService(subject.classSubjectId, quarter);
        const row = gradebook.student.find((s) => s.enrollmentId === enrollmentId);
        bySubject.set(subject.subjectId, {
            grade: row?.quarterGrade ?? null,
            componentGrades: row?.componentGrades ?? []
        });
    }
    return bySubject;
}

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

async function freezeRecordWithin(
    connection: PoolConnection,
    enrollmentId: number,
    quarter: number,
    submittedBy: number | null,
    adviserName: string,
    classSection: string,
    classGradeLevel: number,
    subjects: ClassRecordSubject[],
    computed: Map<number, ComputedSubjectGrade>
): Promise<void> {
    const recordModel = new StudentRecordModel(connection);

    const enrolledSubjectIds = await getEnrolledSubjectIds(recordModel, subjects, enrollmentId);
    const missingSubjectIds = enrolledSubjectIds.filter((subjectId) => computed.get(subjectId)?.grade == null);
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
        const computedSubject = computed.get(subjectId);
        if (!computedSubject || computedSubject.grade === null) {
            continue;
        }
        const subject = subjects.find((s) => s.subjectId === subjectId);
        if (!subject) {
            continue;
        }
        await recordModel.upsertSubjectQuarterGrade(record.id, subject.subjectName, subject.subjectCode, quarter, computedSubject.grade);

        // Composite subjects (e.g. MAPEH): freeze each component's grade for this
        // quarter as well, so the report card's sub-component rows have official
        // data to read (student_academic_record_components).
        if (computedSubject.componentGrades.length === 0) {
            continue;
        }
        const subjectRowId = await recordModel.getSubjectRowId(record.id, subject.subjectName);
        if (subjectRowId === null) {
            continue;
        }
        for (const componentGrade of computedSubject.componentGrades) {
            if (componentGrade.grade === null) {
                continue;
            }
            await recordModel.upsertSubjectComponentQuarterGrade(
                subjectRowId,
                componentGrade.componentId,
                componentGrade.componentName,
                componentGrade.componentCode,
                quarter,
                componentGrade.grade
            );
        }
    }

    await recordModel.upsertQuarterSubmission(record.id, quarter, submittedBy);
}

async function assertSubmissionsNotLocked(connection: PoolConnection): Promise<void> {
    const model = new AcademicSettingsModel(connection);
    const settings = await model.getSettings();
    if (settings?.submissionsLocked) {
        throw new ForbiddenError("Grade submissions are currently locked by the administrator");
    }
}

// ==================== class records view ====================

export async function getClassRecordsService(classId: number, quarter: number, facultyId: number | null): Promise<ClassRecordsResponse> {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        await assertAdviserOfClass(connection, classId, facultyId);

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
                    grade = computedMatrix.get(student.enrollmentId)?.get(subject.subjectId)?.grade ?? null;
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
    facultyId: number | null
): Promise<{ recordId: number; status: "submitted" }> {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        await assertSubmissionsNotLocked(connection);
        await assertAdviserOfClass(connection, classId, facultyId);

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
        const { submittedBy, adviserName } = await resolveSubmitter(classId, facultyId);

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

export async function submitAllStudentRecordsService(classId: number, quarter: number, facultyId: number | null): Promise<SubmitAllResult> {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        await assertSubmissionsNotLocked(connection);
        await assertAdviserOfClass(connection, classId, facultyId);

        const classroom = await getClassroomByIdService(classId, connection);
        if (!classroom) {
            throw new NotFoundError("Classroom not found", 404);
        }

        const recordModel = new StudentRecordModel(connection);
        const subjects = await recordModel.getClassSubjects(classId);
        const roster = await getStudentByClassroomIdService(classId, connection);
        const enrollmentIds = roster.map((s) => s.enrollmentId);

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
        const { submittedBy, adviserName } = await resolveSubmitter(classId, facultyId);

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
                        const enrolledSubjectIds = await getEnrolledSubjectIds(recordModel, subjects, student.enrollmentId);
                        const missingSubjects = enrolledSubjectIds
                            .filter((subjectId) => computed.get(subjectId)?.grade == null)
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
    facultyId: number | null
): Promise<{ status: "pending" }> {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        await assertAdviserOfClass(connection, classId, facultyId);

        const roster = await getStudentByClassroomIdService(classId, connection);
        if (!roster.some((s) => s.enrollmentId === enrollmentId)) {
            throw new NotFoundError("Student is not enrolled in this class", 404);
        }

        const recordModel = new StudentRecordModel(connection);
        const record = await recordModel.getRecordByEnrollmentId(enrollmentId);
        if (!record) {
            throw new NotFoundError("No student record found for this student", 404);
        }

        // Policy Enforcement: Reopening a finalized student record requires an approved amendment request
        if (facultyId !== null) {
            const { default: AmendmentPermissionModel } = await import("../model/amendmentPermission.js");
            const { default: AmendmentRequestModel } = await import("../model/amendmentRequest.js");
            const { default: AmendmentAuditModel } = await import("../model/amendmentAudit.js");

            const permModel = new AmendmentPermissionModel(connection);
            const activePerm = await permModel.getActivePermission(
                facultyId,
                enrollmentId,
                null,
                quarter,
                "student_record_grade"
            );

            if (!activePerm) {
                throw new ForbiddenError(
                    `Reopening student records for Quarter ${quarter} requires an approved Amendment Request from the Register/Admin.`
                );
            }

            await permModel.consumePermission(activePerm.id);
            const reqModel = new AmendmentRequestModel(connection);
            await reqModel.markCompleted(activePerm.requestId);

            const auditModel = new AmendmentAuditModel(connection);
            await auditModel.logAudit({
                requestId: activePerm.requestId,
                action: "reopened",
                actorUserId: (await recordModel.getActiveSchoolYearId()) ?? 0, // Fallback actor
                actorRole: "teacher",
                recordType: "student_record_grade",
                enrollmentId,
                quarter,
                targetTable: "student_academic_record_quarters",
                targetRecordId: String(record.id),
                reason: "Student record reopened via approved amendment"
            });
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

export async function assertQuarterCompleteService(quarter: number, existingConnection?: PoolConnection): Promise<void> {
    const pool = getDBPoolConnection();
    const connection = existingConnection ?? await pool.getConnection();
    const ownConnection = !existingConnection;
    try {
        const recordModel = new StudentRecordModel(connection);

        // The completeness rules are defined per ACTIVE school year (the only
        // year the gradebook and submission workflow operate on). Without one
        // there is nothing meaningful to validate, so a forward advancement is
        // refused instead of silently passing with no checks at all.
        const schoolYearId = await recordModel.getActiveSchoolYearId();
        if (schoolYearId === null) {
            throw new ConflictError(
                "Cannot advance the quarter: no active school year is set. Activate a school year first."
            );
        }

        const withoutAdviser = await recordModel.getClassesWithoutAdviser(schoolYearId);
        const incomplete = await recordModel.getIncompleteClasses(quarter, schoolYearId);
        const incompleteSubjects = await recordModel.getIncompleteClassSubjects(quarter, schoolYearId);

        // EMPTY-CLASS POLICY (explicit): a year whose classes all have advisers
        // and no outstanding submissions has nothing blocking it — including the
        // case where the active year has zero eligible classes. Both blocker
        // lists being empty is the single success condition; there is no
        // separate "must have at least one class" rule.
        if (withoutAdviser.length === 0 && incomplete.length === 0 && incompleteSubjects.length === 0) {
            return;
        }

        const problems: string[] = [];
        for (const cls of incomplete) {
            problems.push(`${cls.section} (${cls.submitted} of ${cls.total} students submitted)`);
        }
        for (const cls of withoutAdviser) {
            problems.push(`${cls.section} has no assigned class adviser`);
        }
        for (const subj of incompleteSubjects) {
            problems.push(`${subj.subjectName} in ${subj.section} (Teacher: ${subj.teacherName || "Unassigned"}) has not submitted records`);
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

// ==================== PDF details ====================

export function determineRecordNumQuarters(
    enrollment: { schoolYearId?: number; isActive?: boolean | number },
    recordSubRows: StudentAcademicRecordSubjectRow[],
    recordSubmissions: QuarterSubmissionRow[],
    schoolYearsWithQ4: Set<number>,
    currentNumQuarters: number
): number {
    // 1. If any subject row in this record has a recorded Q4 grade, it's 4 quarters.
    const hasQ4Grade = recordSubRows.some((row) => row.q4 !== null && row.q4 !== undefined && !Number.isNaN(Number(row.q4)));
    if (hasQ4Grade) {
        return 4;
    }

    // 2. If Q4 submission exists and was submitted for this record, it's 4 quarters.
    const hasQ4Submission = recordSubmissions.some((s) => s.quarter === 4 && s.status === "submitted");
    if (hasQ4Submission) {
        return 4;
    }

    // 3. If this enrollment is for the currently active school year, use the configured academic setting.
    const isActive = Boolean(enrollment.isActive);
    if (isActive) {
        return currentNumQuarters === 3 ? 3 : 4;
    }

    // 4. For historical/completed school years:
    // If any record in that school year had Q4 data, it's a 4-quarter year.
    if (enrollment.schoolYearId && schoolYearsWithQ4.has(enrollment.schoolYearId)) {
        return 4;
    }

    // Otherwise, this historical year only had 3 quarters.
    return 3;
}

export async function StudentRecordPDFDetailsService(
    studentId: number,
    options?: { enrollmentIds?: number[] }
) {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();

    try {
        const student = await getStudentByIdService(studentId, connection);

        const studentRecordModel = new StudentRecordModel(connection);
        // Respect the admin-configured number of grading periods: quarters
        // beyond it are excluded from final ratings and hidden in the PDF.
        const numQuarters = await getNumQuarters();

        let studentEnrollmentRecord = await getAllEnrollmentRecordByStudentId(studentId, connection);
        if (options?.enrollmentIds && options.enrollmentIds.length > 0) {
            const selectedSet = new Set(options.enrollmentIds);
            studentEnrollmentRecord = studentEnrollmentRecord.filter((e) => selectedSet.has(e.enrollmentId));
        }
        const enrollmentIds = studentEnrollmentRecord.map((e) => e.enrollmentId);

        const recordRows = await studentRecordModel.getRecordsByEnrollmentIds(enrollmentIds);
        const recordIds = recordRows.map((r) => r.id);
        const subjectRows = await studentRecordModel.getSubjectRowsByRecordIds(recordIds);
        const allSubmissions = await studentRecordModel.getAllSubmissionsByRecordIds(recordIds);
        const schoolYearIds = studentEnrollmentRecord
            .map((e) => e.schoolYearId)
            .filter((id): id is number => typeof id === "number");
        const schoolYearsWithQ4 = await studentRecordModel.getSchoolYearsWithQuarter4Data(schoolYearIds);

        const recordByEnrollment = new Map(recordRows.map((r) => [r.enrollmentId, r]));
        const subjectRowsByRecordId = new Map<number, StudentAcademicRecordSubjectRow[]>();
        for (const row of subjectRows) {
            const list = subjectRowsByRecordId.get(row.recordId) ?? [];
            list.push(row);
            subjectRowsByRecordId.set(row.recordId, list);
        }

        const submissionsByRecordId = new Map<number, QuarterSubmissionRow[]>();
        for (const s of allSubmissions) {
            const list = submissionsByRecordId.get(s.recordId) ?? [];
            list.push(s);
            submissionsByRecordId.set(s.recordId, list);
        }

        const academicRecord: StudentRecordPdfEntry[] = studentEnrollmentRecord.map((enrollment) => {
            const record = recordByEnrollment.get(enrollment.enrollmentId);
            const recordSubRows = record ? (subjectRowsByRecordId.get(record.id) ?? []) : [];
            const recordSubmissions = record ? (submissionsByRecordId.get(record.id) ?? []) : [];
            const recordNq = determineRecordNumQuarters(
                enrollment,
                recordSubRows,
                recordSubmissions,
                schoolYearsWithQ4,
                numQuarters
            );

            const subjects: StudentRecordPdfSubject[] = recordSubRows.map((row) => {
                const finalRating = calculateFinalGrade({
                    q1: row.q1 != null ? String(row.q1) : null,
                    q2: row.q2 != null ? String(row.q2) : null,
                    q3: row.q3 != null ? String(row.q3) : null,
                    q4: row.q4 != null ? String(row.q4) : null,
                }, recordNq);
                const remarks = finalRating === null ? "" : getRemarks(finalRating);

                return {
                    subjectName: row.subjectName,
                    subjectCode: row.subjectCode,
                    q1: row.q1 === null ? null : Number(row.q1),
                    q2: row.q2 === null ? null : Number(row.q2),
                    q3: row.q3 === null ? null : Number(row.q3),
                    q4: row.q4 === null ? null : Number(row.q4),
                    finalRating,
                    remarks
                };
            });

            // Same helper as the SF9 report card, so an ungraded year is null
            // (rendered blank by the template) instead of a misleading 0.
            const generalAverage = computeGeneralAverage(
                subjects.map((subject) => ({ finalGrades: subject.finalRating }))
            );

            return {
                enrollmentId: enrollment.enrollmentId,
                schoolYear: enrollment.schoolYear,
                recordId: record?.id ?? null,
                classSection: record?.classSection ?? enrollment.section ?? null,
                classGradeLevel: record?.classGradeLevel ?? enrollment.gradeLevel ?? null,
                adviserName: record?.adviserName ?? null,
                subjects,
                generalAverage: generalAverage.score,
                generalAverageRemarks: generalAverage.remarks,
                numQuarters: recordNq
            };
        });

        const sem1 = academicRecord.slice(0, 2);
        const sem2 = academicRecord.slice(2);

        return { student, academicRecord: {semester1: sem1, semester2: sem2}, numQuarters };
    } finally {
        connection.release();
    }
}

// ==================== Subject Teacher Record Ownership Services ====================

export async function getTeacherAssignedSubjectsService(facultyId: number): Promise<TeacherSubjectOption[]> {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        const recordModel = new StudentRecordModel(connection);
        const activeSchoolYearId = await recordModel.getActiveSchoolYearId();
        if (!activeSchoolYearId) {
            return [];
        }

        const subjects = await recordModel.getTeacherClassSubjects(facultyId, activeSchoolYearId);
        if (subjects.length === 0) {
            return [];
        }

        const classSubjectSubmissionModel = new ClassSubjectSubmissionModel(connection);
        const classSubjectIds = subjects.map((s) => s.classSubjectId);
        const submissions = await classSubjectSubmissionModel.getSubmissionsByClassSubjectIds(classSubjectIds, activeSchoolYearId);

        const subMap = new Map<string, QuarterSubmissionStatus>();
        for (const sub of submissions) {
            subMap.set(`${sub.classSubjectId}_${sub.quarter}`, sub.status);
        }

        return subjects.map((s) => {
            const submissionStatus: Record<number, QuarterSubmissionStatus> = {
                1: subMap.get(`${s.classSubjectId}_1`) ?? "pending",
                2: subMap.get(`${s.classSubjectId}_2`) ?? "pending",
                3: subMap.get(`${s.classSubjectId}_3`) ?? "pending",
                4: subMap.get(`${s.classSubjectId}_4`) ?? "pending",
            };
            return {
                ...s,
                submissionStatus
            };
        });
    } finally {
        connection.release();
    }
}

export async function getSubjectClassRecordsService(
    classSubjectId: number,
    quarter: number,
    actorFacultyId: number | null
): Promise<SubjectClassRecordResponse> {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        const recordModel = new StudentRecordModel(connection);
        const classSubject = await recordModel.getClassSubjectById(classSubjectId);
        if (!classSubject) {
            throw new NotFoundError("Class subject assignment not found", 404);
        }

        if (actorFacultyId !== null && classSubject.facultyId !== actorFacultyId) {
            throw new ForbiddenError("You are not assigned to teach this class subject");
        }

        const activeSchoolYearId = await recordModel.getActiveSchoolYearId();
        if (!activeSchoolYearId) {
            throw new ConflictError("No active school year is set");
        }

        const classSubjectSubmissionModel = new ClassSubjectSubmissionModel(connection);
        const submission = await classSubjectSubmissionModel.getSubmission(classSubjectId, quarter, activeSchoolYearId);

        const permModel = new AmendmentPermissionModel(connection);
        const activePermissions = await permModel.getActivePermissionsForClassSubject(classSubjectId, quarter);
        const activePermByEnrollmentId = new Map(activePermissions.map((p) => [p.enrollmentId, p.id]));

        const gradebook = await getGradeBookDetailsByClassSubjectIdService(classSubjectId, quarter);

        // Fetch frozen subject grades if any student was submitted
        const enrollmentIds = gradebook.student.map((s) => s.enrollmentId);
        const records = await recordModel.getRecordsByEnrollmentIds(enrollmentIds);
        const recordByEnrollment = new Map(records.map((r) => [r.enrollmentId, r]));
        const recordIds = records.map((r) => r.id);
        const subjectRows = await recordModel.getSubjectRowsByRecordIds(recordIds);

        const frozenGradeByRecordId = new Map<number, number | null>();
        for (const row of subjectRows) {
            if (row.subjectName.toLowerCase() === classSubject.subjectName.toLowerCase() || row.subjectCode.toLowerCase() === classSubject.subjectCode.toLowerCase()) {
                const col = quarter === 1 ? row.q1 : quarter === 2 ? row.q2 : quarter === 3 ? row.q3 : row.q4;
                frozenGradeByRecordId.set(row.recordId, col !== null && col !== undefined ? Number(col) : null);
            }
        }

        const isSubjectSubmitted = submission?.status === "submitted";

        const students: SubjectStudentRow[] = gradebook.student.map((s) => {
            const record = recordByEnrollment.get(s.enrollmentId);
            const frozenGrade = record ? (frozenGradeByRecordId.get(record.id) ?? null) : null;
            const isStudentSubmitted = isSubjectSubmitted || frozenGrade !== null;

            return {
                enrollmentId: s.enrollmentId,
                studentId: s.studentId,
                studentLrn: s.studentLrn,
                fullname: s.fullname,
                studentSex: s.studentSex,
                writtenWorkScore: s.writtenWorkScore ?? null,
                performanceTaskScore: s.performanceTaskScore ?? null,
                quarterlyAssessmentScore: s.quarterlyAssessmentScore ?? null,
                attendancePresentDays: s.attendance?.presentDays ?? 0,
                attendanceTotalDays: s.attendance?.totalDays ?? 0,
                attendanceRate: s.attendance?.percentage ?? null,
                quarterGrade: isStudentSubmitted && frozenGrade !== null ? frozenGrade : s.quarterGrade,
                source: isStudentSubmitted && frozenGrade !== null ? "frozen" : "computed",
                isFrozen: isStudentSubmitted,
                status: isStudentSubmitted ? "submitted" : "pending",
                submittedAt: submission?.status === "submitted" ? normalizeSubmissionDate(submission.submittedAt) : null,
                hasActiveAmendment: activePermByEnrollmentId.has(s.enrollmentId),
                activePermissionId: activePermByEnrollmentId.get(s.enrollmentId) ?? null,
            };
        });

        const submittedCount = students.filter((s) => s.status === "submitted").length;

        // Resolve teacher name for submittedBy
        let submittedByName: string | null = null;
        if (submission?.submittedBy) {
            const [fRows] = await connection.execute<import("mysql2/promise").RowDataPacket[]>(
                `SELECT CONCAT_WS(' ', firstname, middlename, lastname, IF(suffix IS NOT NULL, CONCAT(' ', suffix), '')) AS name FROM faculties WHERE id = ? LIMIT 1`,
                [submission.submittedBy]
            );
            submittedByName = fRows[0]?.name ?? null;
        }

        return {
            classSubjectId,
            subjectId: classSubject.subjectId,
            subjectName: classSubject.subjectName,
            subjectCode: classSubject.subjectCode,
            classId: classSubject.classId,
            classSection: classSubject.classSection,
            classGradeLevel: classSubject.classGradeLevel,
            quarter,
            isSubjectSubmitted,
            submittedAt: submission ? normalizeSubmissionDate(submission.submittedAt) : null,
            submittedBy: submission?.submittedBy ?? null,
            submittedByName,
            students,
            progress: {
                total: students.length,
                submitted: submittedCount,
                pending: students.length - submittedCount
            }
        };
    } finally {
        connection.release();
    }
}

export async function submitSubjectRecordsService(
    classSubjectId: number,
    quarter: number,
    facultyId: number | null,
    _actorUser?: { id: number; role: string }
): Promise<{ classSubjectId: number; quarter: number; status: "submitted"; totalStudents: number }> {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        await assertSubmissionsNotLocked(connection);
        const recordModel = new StudentRecordModel(connection);
        const classSubject = await recordModel.getClassSubjectById(classSubjectId);
        if (!classSubject) {
            throw new NotFoundError("Class subject assignment not found", 404);
        }

        if (facultyId !== null && classSubject.facultyId !== facultyId) {
            throw new ForbiddenError("You are not assigned to teach this class subject");
        }

        const activeSchoolYearId = await recordModel.getActiveSchoolYearId();
        if (!activeSchoolYearId) {
            throw new ConflictError("No active school year is set");
        }

        const gradebook = await getGradeBookDetailsByClassSubjectIdService(classSubjectId, quarter);
        const missingStudents = gradebook.student.filter((s) => s.quarterGrade === null);
        if (missingStudents.length > 0) {
            throw new ConflictError(
                `Record cannot be submitted: missing grades for ${missingStudents.map((s) => s.fullname).join(", ")}`
            );
        }

        // Adviser details for header creation if needed
        const classroom = await getClassroomByIdService(classSubject.classId, connection);
        const adviser = await getClassAdviserService(classSubject.classId);

        await connection.beginTransaction();
        try {
            for (const student of gradebook.student) {
                let record = await recordModel.getRecordByEnrollmentId(student.enrollmentId);
                if (!record) {
                    const recordId = await recordModel.createRecord({
                        enrollmentId: student.enrollmentId,
                        classSection: classroom?.section ?? classSubject.classSection,
                        classGradeLevel: classroom?.gradeLevel ?? classSubject.classGradeLevel,
                        adviserName: adviser?.adviserFullname ?? ""
                    });
                    record = {
                        id: recordId,
                        enrollmentId: student.enrollmentId,
                        classSection: classroom?.section ?? classSubject.classSection,
                        classGradeLevel: classroom?.gradeLevel ?? classSubject.classGradeLevel,
                        adviserName: adviser?.adviserFullname ?? ""
                    };
                }

                // Freeze subject grade
                await recordModel.upsertSubjectQuarterGrade(
                    record.id,
                    classSubject.subjectName,
                    classSubject.subjectCode,
                    quarter,
                    student.quarterGrade!
                );

                // Freeze components if composite
                if (student.componentGrades && student.componentGrades.length > 0) {
                    const subjectRowId = await recordModel.getSubjectRowId(record.id, classSubject.subjectName);
                    if (subjectRowId !== null) {
                        for (const comp of student.componentGrades) {
                            if (comp.grade !== null) {
                                await recordModel.upsertSubjectComponentQuarterGrade(
                                    subjectRowId,
                                    comp.componentId,
                                    comp.componentName,
                                    comp.componentCode,
                                    quarter,
                                    comp.grade
                                );
                            }
                        }
                    }
                }

                // Check if all enrolled subjects for this student now have submitted grades
                const enrolledRows = await recordModel.getEnrollmentSubjectIds([student.enrollmentId]);
                const enrolledSubjectIds = enrolledRows.filter((r) => r.enrollmentId === student.enrollmentId).map((r) => r.subjectId);
                const subRows = await recordModel.getSubjectRowsByRecordIds([record.id]);
                const hasGradeForQuarter = (col: number | null | undefined) => col !== null && col !== undefined && !Number.isNaN(Number(col));
                const allDone = enrolledSubjectIds.every((_subjId) => {
                    const found = subRows.find((sr) => sr.subjectName === classSubject.subjectName);
                    return found && hasGradeForQuarter(quarter === 1 ? found.q1 : quarter === 2 ? found.q2 : quarter === 3 ? found.q3 : found.q4);
                });
                if (allDone) {
                    await recordModel.upsertQuarterSubmission(record.id, quarter, facultyId);
                }
            }

            const classSubjectSubmissionModel = new ClassSubjectSubmissionModel(connection);
            await classSubjectSubmissionModel.upsertSubmission({
                classSubjectId,
                quarter,
                schoolYearId: activeSchoolYearId,
                status: "submitted",
                submittedBy: facultyId,
                totalStudents: gradebook.student.length,
                submittedStudents: gradebook.student.length
            });

            await connection.commit();
        } catch (err) {
            await connection.rollback();
            throw err;
        }

        return {
            classSubjectId,
            quarter,
            status: "submitted",
            totalStudents: gradebook.student.length
        };
    } finally {
        connection.release();
    }
}

export async function submitSingleStudentSubjectRecordService(
    classSubjectId: number,
    enrollmentId: number,
    quarter: number,
    facultyId: number | null
): Promise<{ enrollmentId: number; quarter: number; status: "submitted" }> {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        await assertSubmissionsNotLocked(connection);
        const recordModel = new StudentRecordModel(connection);
        const classSubject = await recordModel.getClassSubjectById(classSubjectId);
        if (!classSubject) {
            throw new NotFoundError("Class subject assignment not found", 404);
        }

        if (facultyId !== null && classSubject.facultyId !== facultyId) {
            throw new ForbiddenError("You are not assigned to teach this class subject");
        }

        const activeSchoolYearId = await recordModel.getActiveSchoolYearId();
        if (!activeSchoolYearId) {
            throw new ConflictError("No active school year is set");
        }

        const gradebook = await getGradeBookDetailsByClassSubjectIdService(classSubjectId, quarter);
        const student = gradebook.student.find((s) => s.enrollmentId === enrollmentId);
        if (!student) {
            throw new NotFoundError("Student not found in this class subject", 404);
        }
        if (student.quarterGrade === null) {
            throw new ConflictError(`Cannot submit record: no grade computed yet for ${student.fullname}`);
        }

        const classroom = await getClassroomByIdService(classSubject.classId, connection);
        const adviser = await getClassAdviserService(classSubject.classId);

        await connection.beginTransaction();
        try {
            let record = await recordModel.getRecordByEnrollmentId(enrollmentId);
            if (!record) {
                const recordId = await recordModel.createRecord({
                    enrollmentId,
                    classSection: classroom?.section ?? classSubject.classSection,
                    classGradeLevel: classroom?.gradeLevel ?? classSubject.classGradeLevel,
                    adviserName: adviser?.adviserFullname ?? ""
                });
                record = {
                    id: recordId,
                    enrollmentId,
                    classSection: classroom?.section ?? classSubject.classSection,
                    classGradeLevel: classroom?.gradeLevel ?? classSubject.classGradeLevel,
                    adviserName: adviser?.adviserFullname ?? ""
                };
            }

            await recordModel.upsertSubjectQuarterGrade(
                record.id,
                classSubject.subjectName,
                classSubject.subjectCode,
                quarter,
                student.quarterGrade
            );

            if (student.componentGrades && student.componentGrades.length > 0) {
                const subjectRowId = await recordModel.getSubjectRowId(record.id, classSubject.subjectName);
                if (subjectRowId !== null) {
                    for (const comp of student.componentGrades) {
                        if (comp.grade !== null) {
                            await recordModel.upsertSubjectComponentQuarterGrade(
                                subjectRowId,
                                comp.componentId,
                                comp.componentName,
                                comp.componentCode,
                                quarter,
                                comp.grade
                            );
                        }
                    }
                }
            }

            const classSubjectSubmissionModel = new ClassSubjectSubmissionModel(connection);
            const currentSub = await classSubjectSubmissionModel.getSubmission(classSubjectId, quarter, activeSchoolYearId);
            const nextSubmittedCount = (currentSub?.submittedStudents ?? 0) + 1;
            const isAllSubmitted = nextSubmittedCount >= gradebook.student.length;

            await classSubjectSubmissionModel.upsertSubmission({
                classSubjectId,
                quarter,
                schoolYearId: activeSchoolYearId,
                status: isAllSubmitted ? "submitted" : (currentSub?.status ?? "pending"),
                submittedBy: facultyId,
                totalStudents: gradebook.student.length,
                submittedStudents: Math.min(nextSubmittedCount, gradebook.student.length)
            });

            await connection.commit();
        } catch (err) {
            await connection.rollback();
            throw err;
        }

        return { enrollmentId, quarter, status: "submitted" };
    } finally {
        connection.release();
    }
}

export async function reopenSubjectRecordService(
    classSubjectId: number,
    quarter: number,
    facultyId: number | null,
    _actorUser?: { id: number; role: string }
): Promise<{ status: "pending" }> {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        const recordModel = new StudentRecordModel(connection);
        const classSubject = await recordModel.getClassSubjectById(classSubjectId);
        if (!classSubject) {
            throw new NotFoundError("Class subject assignment not found", 404);
        }

        if (facultyId !== null && classSubject.facultyId !== facultyId) {
            throw new ForbiddenError("You are not assigned to teach this class subject");
        }

        const activeSchoolYearId = await recordModel.getActiveSchoolYearId();
        if (!activeSchoolYearId) {
            throw new ConflictError("No active school year is set");
        }

        const classSubjectSubmissionModel = new ClassSubjectSubmissionModel(connection);
        const currentSub = await classSubjectSubmissionModel.getSubmission(classSubjectId, quarter, activeSchoolYearId);
        if (!currentSub || currentSub.status !== "submitted") {
            throw new ConflictError("Class subject record is not currently submitted for this quarter");
        }

        await classSubjectSubmissionModel.upsertSubmission({
            classSubjectId,
            quarter,
            schoolYearId: activeSchoolYearId,
            status: "pending",
            submittedBy: null,
            totalStudents: currentSub.totalStudents,
            submittedStudents: 0
        });

        return { status: "pending" };
    } finally {
        connection.release();
    }
}

export async function getSubjectSubmissionSummaryService(schoolYearId?: number): Promise<SubjectSubmissionSummaryRow[]> {
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

        const rows = await recordModel.getSubjectSubmissionSummary(yearId);
        if (rows.length === 0) {
            return [];
        }

        const classSubjectSubmissionModel = new ClassSubjectSubmissionModel(connection);
        const allSubmissions = await classSubjectSubmissionModel.getAllSubmissionsBySchoolYear(yearId);

        const subMap = new Map<string, ClassSubjectSubmissionRow>();
        for (const s of allSubmissions) {
            subMap.set(`${s.classSubjectId}_${s.quarter}`, s);
        }

        return rows.map((r) => {
            const submittedCounts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
            const statusByQuarter: Record<number, QuarterSubmissionStatus> = {
                1: "pending",
                2: "pending",
                3: "pending",
                4: "pending"
            };

            for (let q = 1; q <= 4; q++) {
                const sub = subMap.get(`${r.classSubjectId}_${q}`);
                if (sub) {
                    submittedCounts[q] = sub.submittedStudents;
                    statusByQuarter[q] = sub.status;
                }
            }

            return {
                ...r,
                submitted: submittedCounts,
                statusByQuarter
            };
        });
    } finally {
        connection.release();
    }
}
