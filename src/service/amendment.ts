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
import type {
    AmendmentRequestCreateProps,
    AmendmentRequestRow,
    AmendmentStatus
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
                "SELECT facultyId FROM class_subjects WHERE id = ? LIMIT 1",
                [props.classSubjectId]
            );
            if (subjectRows.length === 0) {
                throw new NotFoundError("Class subject not found", 404);
            }
            if (Number(subjectRows[0]?.facultyId) !== facultyId) {
                throw new ForbiddenError("You are not assigned to teach this class subject");
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

        // Regulatory Gate: Invalidate existing SF10 registrar sign-off if record was previously confirmed
        await connection.execute<ResultSetHeader>(
            `UPDATE student_academic_record_quarters sarq
             JOIN student_academic_records sar ON sar.id = sarq.recordId
             SET sarq.confirmedAt = NULL, sarq.confirmedBy = NULL
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
