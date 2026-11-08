import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getDBPoolConnection } from "../config/database.js";
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from "../middleware/errors.js";
import { ROLES, type UserRoles } from "../constant/users.js";
import { FACULTY_ROLES } from "../constant/faculties.js";
import AmendmentRequestModel from "../model/amendmentRequest.js";
import AmendmentPermissionModel from "../model/amendmentPermission.js";
import AmendmentAuditModel from "../model/amendmentAudit.js";
import FacultyModel from "../model/faculties.js";
import ClassroomsModel from "../model/classrooms.js";
import StudentRecordModel from "../model/studentRecord.js";
import { getGradeBookDetailsByClassSubjectIdService } from "./gradebook.js";
import type {
    AmendmentRequestCreateProps,
    AmendmentRequestRow,
    AmendmentStatus,
    AmendmentRequestDetails,
    SubjectAmendmentChanges
} from "../constant/amendment.js";
import { resolveTeachingFacultyId, resolveRegisterFacultyId } from "./authorization.js";

export async function submitAmendmentRequestService(
    actorUser: { id: number; role: UserRoles },
    props: AmendmentRequestCreateProps,
    clientMeta?: { ipAddress?: string | null; userAgent?: string | null }
): Promise<{ id: number; requestNumber: string }> {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();

    try {
        const facultyId = await resolveTeachingFacultyId(actorUser, connection);
        if (!facultyId) {
            throw new ForbiddenError("Only teaching faculty may submit amendment requests");
        }

        // Ownership: If classSubjectId is provided, verify this faculty teaches it
        if (props.classSubjectId) {
            const [subjectRows] = await connection.execute<RowDataPacket[]>(
                "SELECT facultyId, classId FROM class_subjects WHERE id = ? LIMIT 1",
                [props.classSubjectId]
            );
            if (subjectRows.length === 0) {
                throw new NotFoundError("Class subject not found", 404);
            }
            if (Number(subjectRows[0]?.facultyId) !== facultyId) {
                throw new ForbiddenError("You are not assigned to teach this class subject");
            }
            if (!props.classId && subjectRows[0]?.classId) {
                props.classId = Number(subjectRows[0].classId);
            }
        } else {
            // Class-level attendance or student record: verify faculty is the class adviser
            const classroomModel = new ClassroomsModel(connection);
            const adviser = await classroomModel.getClassAdviser(props.classId);
            if (!adviser || adviser.adviserId !== facultyId) {
                throw new ForbiddenError("You are not the designated adviser for this class");
            }
        }

        const reqModel = new AmendmentRequestModel(connection);

        // Check for existing active or pending request
        const hasExisting = await reqModel.hasActiveOrPendingRequest(
            props.enrollmentId,
            props.classSubjectId,
            props.quarter,
            props.recordType
        );

        if (hasExisting) {
            throw new ConflictError(
                "An active or pending amendment request already exists for this student, subject, and quarter"
            );
        }

        const requestNumber = await reqModel.generateRequestNumber();
        const requestId = await reqModel.createRequest(facultyId, props, requestNumber);

        const auditModel = new AmendmentAuditModel(connection);
        await auditModel.logAudit({
            requestId,
            action: "requested",
            actorUserId: actorUser.id,
            actorRole: actorUser.role,
            recordType: props.recordType,
            enrollmentId: props.enrollmentId,
            quarter: props.quarter,
            targetTable: "amendment_requests",
            targetRecordId: String(requestId),
            diff: props.details,
            reason: props.reason,
            ipAddress: clientMeta?.ipAddress ?? null,
            userAgent: clientMeta?.userAgent ?? null
        });

        return { id: requestId, requestNumber };
    } finally {
        connection.release();
    }
}

export async function getAmendmentRequestsService(
    actorUser: { id: number; role: UserRoles },
    filters: {
        status?: AmendmentStatus | undefined;
        quarter?: number | undefined;
        classId?: number | undefined;
        requesterFacultyId?: number | undefined;
    } = {}
): Promise<AmendmentRequestRow[]> {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();

    try {
        const reqModel = new AmendmentRequestModel(connection);

        // Check if admin or register staff
        if (actorUser.role === ROLES.ADMIN) {
            return await reqModel.getRequests(filters);
        }

        const facultyModel = new FacultyModel(connection);
        const faculty = await facultyModel.getFacultyByUserId(actorUser.id);
        if (!faculty) {
            throw new ForbiddenError("No faculty profile found");
        }

        if (faculty.role === FACULTY_ROLES.REGISTER) {
            // Register staff views all requests
            return await reqModel.getRequests(filters);
        }

        // Teaching faculty only views their own requests
        return await reqModel.getRequests({
            ...filters,
            requesterFacultyId: faculty.id
        });
    } finally {
        connection.release();
    }
}

export async function getAmendmentRequestByIdService(
    actorUser: { id: number; role: UserRoles },
    requestId: number
): Promise<AmendmentRequestRow> {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();

    try {
        const reqModel = new AmendmentRequestModel(connection);
        const request = await reqModel.getRequestById(requestId);

        if (!request) {
            throw new NotFoundError("Amendment request not found", 404);
        }

        if (actorUser.role !== ROLES.ADMIN) {
            const facultyModel = new FacultyModel(connection);
            const faculty = await facultyModel.getFacultyByUserId(actorUser.id);
            if (!faculty) {
                throw new ForbiddenError("No faculty profile found");
            }

            if (faculty.role !== FACULTY_ROLES.REGISTER && request.requesterFacultyId !== faculty.id) {
                throw new ForbiddenError("You may only view your own amendment requests");
            }
        }

        const permModel = new AmendmentPermissionModel(connection);
        const permission = await permModel.getPermissionByRequestId(requestId);

        const auditModel = new AmendmentAuditModel(connection);
        const auditLogs = await auditModel.getAuditLogsByRequest(requestId);

        return {
            ...request,
            permission,
            auditLogs
        } as any;
    } finally {
        connection.release();
    }
}

export async function reviewAmendmentRequestService(
    reviewerUser: { id: number; role: UserRoles },
    requestId: number,
    decision: "approved" | "rejected",
    rejectionReason?: string | null,
    durationHours: number = 24,
    clientMeta?: { ipAddress?: string | null; userAgent?: string | null }
): Promise<{ status: AmendmentStatus }> {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();

    await connection.beginTransaction();
    try {
        // Assert reviewer is admin or register faculty
        if (reviewerUser.role !== ROLES.ADMIN) {
            const registerFacultyId = await resolveRegisterFacultyId(reviewerUser, connection);
            if (!registerFacultyId) {
                throw new ForbiddenError("Only the administrator or registration office may review amendment requests");
            }
        }

        const reqModel = new AmendmentRequestModel(connection);
        const permModel = new AmendmentPermissionModel(connection);
        const auditModel = new AmendmentAuditModel(connection);

        // Fetch request with lock
        const [rows] = await connection.execute<RowDataPacket[]>(
            "SELECT * FROM amendment_requests WHERE id = ? FOR UPDATE",
            [requestId]
        );
        const request = rows[0] as AmendmentRequestRow | undefined;

        if (!request) {
            throw new NotFoundError("Amendment request not found", 404);
        }

        if (request.status !== "pending") {
            throw new ConflictError(`This amendment request is already ${request.status}`);
        }

        if (decision === "rejected") {
            if (!rejectionReason || rejectionReason.trim().length === 0) {
                throw new BadRequestError("A rejection reason is required when rejecting an amendment request");
            }

            await reqModel.updateStatus(requestId, "rejected", reviewerUser.id, rejectionReason.trim());

            await auditModel.logAudit({
                requestId,
                action: "rejected",
                actorUserId: reviewerUser.id,
                actorRole: reviewerUser.role,
                recordType: request.recordType,
                enrollmentId: request.enrollmentId,
                quarter: request.quarter,
                targetTable: "amendment_requests",
                targetRecordId: String(requestId),
                reason: rejectionReason.trim(),
                ipAddress: clientMeta?.ipAddress ?? null,
                userAgent: clientMeta?.userAgent ?? null
            });

            await connection.commit();
            return { status: "rejected" };
        }

        // Decision: APPROVED
        await reqModel.updateStatus(requestId, "approved", reviewerUser.id, null);

        let detailsParsed: { assessmentId?: number; attendanceDate?: string } = {};
        try {
            detailsParsed = JSON.parse(request.details);
        } catch {
            detailsParsed = {};
        }

        await permModel.createPermission({
            requestId,
            facultyId: request.requesterFacultyId,
            enrollmentId: request.enrollmentId,
            classSubjectId: request.classSubjectId,
            classId: request.classId,
            quarter: request.quarter,
            recordType: request.recordType,
            assessmentId: detailsParsed.assessmentId ?? null,
            attendanceDate: detailsParsed.attendanceDate ?? null,
            durationHours: Math.max(1, Math.min(168, durationHours)) // between 1h and 7 days
        });

        // Regulatory Gate: Invalidate existing submission if record was previously submitted
        await connection.execute<ResultSetHeader>(
            `UPDATE student_academic_record_quarters sarq
             JOIN student_academic_records sar ON sar.id = sarq.recordId
             SET sarq.status = 'pending'
             WHERE sar.enrollmentId = ? AND sarq.quarter = ?`,
            [request.enrollmentId, request.quarter]
        );

        await auditModel.logAudit({
            requestId,
            action: "approved",
            actorUserId: reviewerUser.id,
            actorRole: reviewerUser.role,
            recordType: request.recordType,
            enrollmentId: request.enrollmentId,
            quarter: request.quarter,
            targetTable: "amendment_permissions",
            targetRecordId: String(requestId),
            diff: { durationHours, expiresAfterHours: durationHours },
            reason: `Approved with ${durationHours}h editing window`,
            ipAddress: clientMeta?.ipAddress ?? null,
            userAgent: clientMeta?.userAgent ?? null
        });

        await connection.commit();
        return { status: "approved" };
    } catch (err) {
        await connection.rollback();
        throw err;
    } finally {
        connection.release();
    }
}

export async function revokeAmendmentRequestService(
    reviewerUser: { id: number; role: UserRoles },
    requestId: number,
    clientMeta?: { ipAddress?: string | null; userAgent?: string | null }
): Promise<{ status: "revoked" }> {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();

    await connection.beginTransaction();
    try {
        if (reviewerUser.role !== ROLES.ADMIN) {
            await resolveRegisterFacultyId(reviewerUser, connection);
        }

        const reqModel = new AmendmentRequestModel(connection);
        const permModel = new AmendmentPermissionModel(connection);
        const auditModel = new AmendmentAuditModel(connection);

        const request = await reqModel.getRequestById(requestId);
        if (!request) {
            throw new NotFoundError("Amendment request not found", 404);
        }

        await reqModel.updateStatus(requestId, "revoked", reviewerUser.id, "Manually revoked by administrator");
        await permModel.revokePermission(requestId);

        await auditModel.logAudit({
            requestId,
            action: "revoked",
            actorUserId: reviewerUser.id,
            actorRole: reviewerUser.role,
            recordType: request.recordType,
            enrollmentId: request.enrollmentId,
            quarter: request.quarter,
            targetTable: "amendment_permissions",
            targetRecordId: String(requestId),
            reason: "Revoked by administrator",
            ipAddress: clientMeta?.ipAddress ?? null,
            userAgent: clientMeta?.userAgent ?? null
        });

        await connection.commit();
        return { status: "revoked" };
    } catch (err) {
        await connection.rollback();
        throw err;
    } finally {
        connection.release();
    }
}

export async function applyUnifiedSubjectAmendmentService(
    actorUser: { id: number; role: UserRoles },
    permissionId: number,
    data: {
        changes?: {
            gradebook?: Array<{ assessmentId: number; score?: number | string | null; proposedScore?: number | string | null }>;
            attendance?: Array<{ date: string; status?: string; proposedStatus?: string }>;
        };
        markAsCompleted?: boolean;
    },
    clientMeta?: { ipAddress?: string | null; userAgent?: string | null }
): Promise<{ success: boolean; modifiedCount: number; newQuarterGrade: number | null; status: AmendmentStatus }> {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();

    await connection.beginTransaction();
    try {
        const permModel = new AmendmentPermissionModel(connection);
        const reqModel = new AmendmentRequestModel(connection);
        const auditModel = new AmendmentAuditModel(connection);
        const recordModel = new StudentRecordModel(connection);

        const permission = await permModel.getPermissionById(permissionId);
        if (!permission) {
            throw new NotFoundError("Amendment permission not found", 404);
        }

        if (permission.status !== "active") {
            throw new ForbiddenError(`Amendment permission is already ${permission.status}`);
        }

        if (new Date(permission.expiresAt) <= new Date()) {
            await permModel.expireOverduePermissions();
            throw new ForbiddenError("Amendment permission has expired");
        }

        let facultyId: number | null = null;
        if (actorUser.role !== ROLES.ADMIN) {
            facultyId = await resolveTeachingFacultyId(actorUser, connection);
            if (!facultyId || permission.facultyId !== facultyId) {
                throw new ForbiddenError("You are not authorized to use this amendment permission");
            }
        }

        const request = await reqModel.getRequestById(permission.requestId);
        if (!request) {
            throw new NotFoundError("Associated amendment request not found", 404);
        }

        let details: AmendmentRequestDetails = {};
        try {
            details = typeof request.details === "string" ? JSON.parse(request.details) : (request.details as any);
        } catch {
            details = {};
        }

        const changesToApply = data.changes ?? (details.changes as any) ?? {};
        let modifiedCount = 0;

        // 1. Gradebook score modifications (only if permitted)
        if (changesToApply.gradebook && changesToApply.gradebook.length > 0) {
            if (permission.recordType === "attendance") {
                throw new ForbiddenError("This amendment permission only authorizes attendance corrections");
            }

            const StudentScoreModel = (await import("../model/studentScore.js")).default;
            const scoreModel = new StudentScoreModel(connection);

            for (const item of changesToApply.gradebook) {
                const targetScoreRaw = item.score !== undefined ? item.score : item.proposedScore;
                if (targetScoreRaw === undefined || targetScoreRaw === null || targetScoreRaw === "") {
                    continue;
                }
                const targetScore = Number(targetScoreRaw);

                // Fetch assessment details
                const [assRows] = await connection.execute<RowDataPacket[]>(
                    "SELECT title, maxScore FROM assessments WHERE id = ? LIMIT 1",
                    [item.assessmentId]
                );
                if (assRows.length === 0 || !assRows[0]) {
                    continue;
                }
                const assessmentTitle = String(assRows[0].title);
                const maxScore = Number(assRows[0].maxScore);

                if (targetScore < 0 || targetScore > maxScore) {
                    throw new BadRequestError(`Score ${targetScore} for "${assessmentTitle}" must be between 0 and ${maxScore}`);
                }

                // Query current score in DB
                const [existingRows] = await connection.execute<RowDataPacket[]>(
                    "SELECT score FROM student_scores WHERE assessmentId = ? AND enrollmentId = ? LIMIT 1",
                    [item.assessmentId, permission.enrollmentId]
                );
                const previousScore = existingRows[0]?.score !== undefined && existingRows[0]?.score !== null
                    ? Number(existingRows[0].score)
                    : null;

                // Compare actual values
                if (previousScore !== targetScore) {
                    modifiedCount++;
                    await scoreModel.upsertScoresBatch(item.assessmentId, [
                        { enrollmentId: permission.enrollmentId, score: targetScore }
                    ]);

                    await auditModel.logAudit({
                        requestId: permission.requestId,
                        action: "modified",
                        actorUserId: actorUser.id,
                        actorRole: actorUser.role,
                        recordType: "gradebook_score",
                        enrollmentId: permission.enrollmentId,
                        quarter: permission.quarter,
                        targetTable: "student_scores",
                        targetRecordId: `${item.assessmentId}-${permission.enrollmentId}`,
                        beforeState: { field: assessmentTitle, assessmentId: item.assessmentId, score: previousScore },
                        afterState: { field: assessmentTitle, assessmentId: item.assessmentId, score: targetScore },
                        diff: {
                            record: "Gradebook",
                            field: assessmentTitle,
                            assessmentId: item.assessmentId,
                            previousValue: previousScore,
                            updatedValue: targetScore,
                            before: previousScore,
                            after: targetScore
                        },
                        reason: `Amended score for ${assessmentTitle} (${previousScore ?? "—"} → ${targetScore}) under ${request.requestNumber}`,
                        ipAddress: clientMeta?.ipAddress ?? null,
                        userAgent: clientMeta?.userAgent ?? null
                    });
                }
            }
        }

        // 2. Attendance modifications (only if permitted)
        if (changesToApply.attendance && changesToApply.attendance.length > 0 && permission.classSubjectId) {
            if (permission.recordType === "gradebook_score") {
                throw new ForbiddenError("This amendment permission only authorizes gradebook corrections");
            }

            for (const item of changesToApply.attendance) {
                const targetStatus = (item.status ?? item.proposedStatus)?.trim().toLowerCase();
                if (!targetStatus) continue;

                // Query current attendance
                const [existingRows] = await connection.execute<RowDataPacket[]>(
                    "SELECT status FROM student_attendance WHERE classSubjectId = ? AND enrollmentId = ? AND date = ? LIMIT 1",
                    [permission.classSubjectId, permission.enrollmentId, item.date]
                );
                const previousStatus = existingRows[0]?.status ? String(existingRows[0].status).toLowerCase() : null;

                if (previousStatus !== targetStatus) {
                    modifiedCount++;
                    const query = `
                        INSERT INTO student_attendance (classSubjectId, enrollmentId, date, status, quarter)
                        VALUES (?, ?, ?, ?, ?)
                        ON DUPLICATE KEY UPDATE status = VALUES(status), updated_at = CURRENT_TIMESTAMP
                    `;
                    await connection.execute(query, [
                        permission.classSubjectId,
                        permission.enrollmentId,
                        item.date,
                        targetStatus,
                        permission.quarter
                    ]);

                    await auditModel.logAudit({
                        requestId: permission.requestId,
                        action: "modified",
                        actorUserId: actorUser.id,
                        actorRole: actorUser.role,
                        recordType: "attendance",
                        enrollmentId: permission.enrollmentId,
                        quarter: permission.quarter,
                        targetTable: "student_attendance",
                        targetRecordId: `${permission.classSubjectId}-${permission.enrollmentId}-${item.date}`,
                        beforeState: { field: item.date, date: item.date, status: previousStatus },
                        afterState: { field: item.date, date: item.date, status: targetStatus },
                        diff: {
                            record: "Attendance",
                            field: item.date,
                            date: item.date,
                            previousValue: previousStatus,
                            updatedValue: targetStatus,
                            before: previousStatus,
                            after: targetStatus
                        },
                        reason: `Amended attendance for ${item.date} (${previousStatus ?? "—"} → ${targetStatus}) under ${request.requestNumber}`,
                        ipAddress: clientMeta?.ipAddress ?? null,
                        userAgent: clientMeta?.userAgent ?? null
                    });
                }
            }
        }

        // 3. Status transition & Quarter Grade Recomputation
        let currentStatus: AmendmentStatus = request.status;

        if (modifiedCount > 0 && currentStatus === "approved") {
            await reqModel.markInProgress(permission.requestId);
            currentStatus = "in_progress";
        }

        let newQuarterGrade: number | null = null;
        if (permission.classSubjectId) {
            const gradebook = await getGradeBookDetailsByClassSubjectIdService(permission.classSubjectId, permission.quarter);
            const student = gradebook.student.find((s) => s.enrollmentId === permission.enrollmentId);
            newQuarterGrade = student?.quarterGrade ?? null;

            // Update frozen student_academic_record_subjects if record exists
            const classSubject = await recordModel.getClassSubjectById(permission.classSubjectId);
            const record = await recordModel.getRecordByEnrollmentId(permission.enrollmentId);
            if (record && classSubject && newQuarterGrade !== null) {
                await recordModel.upsertSubjectQuarterGrade(
                    record.id,
                    classSubject.subjectName,
                    classSubject.subjectCode,
                    permission.quarter,
                    newQuarterGrade
                );
            }
        }

        // 4. Handle Completion if requested
        if (data.markAsCompleted) {
            await permModel.consumePermission(permission.id);
            await reqModel.markCompleted(permission.requestId);
            currentStatus = "completed";

            await auditModel.logAudit({
                requestId: permission.requestId,
                action: "consumed",
                actorUserId: actorUser.id,
                actorRole: actorUser.role,
                recordType: permission.recordType,
                enrollmentId: permission.enrollmentId,
                quarter: permission.quarter,
                targetTable: "amendment_requests",
                targetRecordId: String(permission.requestId),
                diff: { modifiedCount, newQuarterGrade, completedAt: new Date().toISOString() },
                reason: "Teacher finalized and completed all authorized amendment corrections",
                ipAddress: clientMeta?.ipAddress ?? null,
                userAgent: clientMeta?.userAgent ?? null
            });
        }

        await connection.commit();
        return { success: true, modifiedCount, newQuarterGrade, status: currentStatus };
    } catch (err) {
        await connection.rollback();
        throw err;
    } finally {
        connection.release();
    }
}
