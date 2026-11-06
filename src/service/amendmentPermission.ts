import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { getDBPoolConnection } from "../config/database.js";
import { ForbiddenError } from "../middleware/errors.js";
import AcademicSettingsModel from "../model/academicSettings.js";
import StudentRecordModel from "../model/studentRecord.js";
import AmendmentPermissionModel from "../model/amendmentPermission.js";
import AmendmentRequestModel from "../model/amendmentRequest.js";
import AmendmentAuditModel from "../model/amendmentAudit.js";
import type { AmendmentRecordType } from "../constant/amendment.js";
import { computeAuditDiff } from "../helper/auditDiff.js";

export interface WritePermissionScope {
    enrollmentId: number;
    classSubjectId?: number | null;
    classId?: number;
    quarter: number;
    recordType: AmendmentRecordType;
    assessmentId?: number;
    attendanceDate?: string;
}

/**
 * Validates whether a write operation is authorized against quarter-locking and
 * frozen record policies.
 * 
 * Returns the active amendment permission ID if permission was required and validated;
 * returns null if the record is currently open for standard editing.
 * Throws ForbiddenError (403) if the resource is locked without an active permission.
 */
export async function assertWritePermission(
    connection: PoolConnection,
    actorFacultyId: number | null,
    scope: WritePermissionScope
): Promise<number | null> {
    // 1. Privileged users (Admin / Developer) bypass ownership, but modifications
    // should still be treated as authorized
    if (actorFacultyId === null) {
        return null;
    }

    // 2. Check academic settings for current quarter and system-wide submission lock
    const settingsModel = new AcademicSettingsModel(connection);
    const settings = await settingsModel.getSettings();
    const currentQuarter = settings?.currentQuarter ?? 1;
    const isSystemLocked = Boolean(settings?.submissionsLocked);

    if (isSystemLocked) {
        throw new ForbiddenError("All submissions and record modifications are locked by the administrator");
    }

    const isPastQuarter = scope.quarter < currentQuarter;

    // 3. Check if the resource is open or locked:
    // If it's the current quarter:
    if (!isPastQuarter) {
        if (scope.recordType === "gradebook_score" || scope.recordType === "student_record_grade") {
            const recordModel = new StudentRecordModel(connection);
            const record = await recordModel.getRecordByEnrollmentId(scope.enrollmentId);
            if (record) {
                const submissions = await recordModel.getSubmissionsByRecordIds([record.id], scope.quarter);
                const isSubmitted = submissions.some((s) => s.quarter === scope.quarter && s.status === "submitted");
                if (!isSubmitted) {
                    // Current quarter, record is not finalized: standard edit is allowed
                    return null;
                }
            } else {
                // No student record header exists yet: standard edit is allowed
                return null;
            }
        } else if (scope.recordType === "attendance") {
            // Current quarter attendance is open
            return null;
        }
    }

    // 4. Resource is LOCKED (past quarter or frozen finalized record)
    // Must find an active, non-expired amendment permission matching the 5-point tuple
    const permModel = new AmendmentPermissionModel(connection);
    const activePerm = await permModel.getActivePermission(
        actorFacultyId,
        scope.enrollmentId,
        scope.classSubjectId,
        scope.quarter,
        scope.recordType
    );

    if (!activePerm) {
        if (isPastQuarter) {
            throw new ForbiddenError(
                `Quarter ${scope.quarter} is locked. You must submit an Amendment Request to the Register/Admin to modify this record.`
            );
        } else {
            throw new ForbiddenError(
                `This student's Quarter ${scope.quarter} record has been finalized and submitted. You must submit an Amendment Request to the Register/Admin to modify this record.`
            );
        }
    }

    return activePerm.id;
}

/**
 * Wraps a record modification in a transactional audit and permission consumption step.
 */
export async function executeWithAmendmentAudit<T>(
    connection: PoolConnection,
    actor: { id: number; facultyId: number | null; role: string },
    scope: WritePermissionScope,
    auditMeta: {
        targetTable: string;
        targetRecordId: string;
        beforeState: any;
        reason?: string | undefined;
        ipAddress?: string | null | undefined;
        userAgent?: string | null | undefined;
    },
    actionCallback: () => Promise<{ result: T; afterState: any }>
): Promise<T> {
    const permissionId = await assertWritePermission(connection, actor.facultyId, scope);

    const { result, afterState } = await actionCallback();

    // If an amendment permission was required and consumed
    if (permissionId !== null) {
        const permModel = new AmendmentPermissionModel(connection);
        const reqModel = new AmendmentRequestModel(connection);
        const auditModel = new AmendmentAuditModel(connection);

        const perm = await permModel.getPermissionByRequestId(permissionId);
        await permModel.consumePermission(permissionId);

        if (perm) {
            await reqModel.markCompleted(perm.requestId);
        }

        const diff = computeAuditDiff(auditMeta.beforeState, afterState);

        await auditModel.logAudit({
            requestId: perm?.requestId ?? null,
            action: "modified",
            actorUserId: actor.id,
            actorRole: actor.role,
            recordType: scope.recordType,
            enrollmentId: scope.enrollmentId,
            quarter: scope.quarter,
            targetTable: auditMeta.targetTable,
            targetRecordId: auditMeta.targetRecordId,
            beforeState: auditMeta.beforeState,
            afterState,
            diff,
            reason: auditMeta.reason ?? null,
            ipAddress: auditMeta.ipAddress ?? null,
            userAgent: auditMeta.userAgent ?? null,
        });
    }

    return result;
}
