import type { Request, Response, NextFunction } from "express";
import {
    submitAmendmentRequestService,
    getAmendmentRequestsService,
    getAmendmentRequestByIdService,
    reviewAmendmentRequestService,
    revokeAmendmentRequestService,
    applyUnifiedSubjectAmendmentService
} from "../service/amendment.js";
import AmendmentAuditModel from "../model/amendmentAudit.js";
import { SuccessResponse } from "../helper/response.js";
import { BadRequestError } from "../middleware/errors.js";
import type { AmendmentRequestCreateProps, AmendmentStatus } from "../constant/amendment.js";
import { getNumQuarters } from "../service/academicSettings.js";
import { isValidQuarter } from "../helper/quarterValidation.js";

// POST /api/amendments/requests
export async function submitAmendmentRequestController(
    req: Request<{}, {}, AmendmentRequestCreateProps>,
    res: Response,
    next: NextFunction
) {
    try {
        const { enrollmentId, classSubjectId, quarter, recordType, reason } = req.body;
        const rawClassId = req.body.classId ?? (req.body as any).classroomId;
        const classId = rawClassId !== undefined ? Number(rawClassId) : undefined;
        const details = req.body.details ?? {
            currentValues: (req.body as any).currentValues ?? null,
            proposedValues: (req.body as any).proposedValues ?? null,
            studentId: (req.body as any).studentId ?? null
        };

        if (!enrollmentId || Number.isNaN(Number(enrollmentId))) {
            throw new BadRequestError("Valid enrollmentId is required");
        }
        if (!classId || Number.isNaN(Number(classId))) {
            throw new BadRequestError("Valid classId is required");
        }
        const numQuarters = await getNumQuarters();
        const parsedQuarter = Number(quarter);
        if (Number.isNaN(parsedQuarter) || !isValidQuarter(parsedQuarter, numQuarters)) {
            throw new BadRequestError(`Quarter must be between 1 and ${numQuarters}`);
        }
        if (!recordType || !["gradebook_score", "student_record_grade", "attendance", "subject_record"].includes(recordType)) {
            throw new BadRequestError("Record type must be gradebook_score, student_record_grade, attendance, or subject_record");
        }
        if (!reason || reason.trim().length < 5) {
            throw new BadRequestError("A detailed reason of at least 5 characters is required");
        }
        if (!details || typeof details !== "object") {
            throw new BadRequestError("Details object is required");
        }

        const clientMeta = {
            ipAddress: req.ip || req.socket.remoteAddress || null,
            userAgent: req.headers["user-agent"] || null
        };

        const result = await submitAmendmentRequestService(
            req.user!,
            {
                enrollmentId: Number(enrollmentId),
                classSubjectId: classSubjectId ? Number(classSubjectId) : null,
                classId: Number(classId),
                quarter: parsedQuarter,
                recordType,
                reason,
                details
            },
            clientMeta
        );

        res.status(201).json(
            SuccessResponse({
                message: "Amendment request submitted successfully",
                data: result
            })
        );
    } catch (err) {
        next(err);
    }
}

// GET /api/amendments/my-requests
export async function getMyAmendmentRequestsController(
    req: Request,
    res: Response,
    next: NextFunction
) {
    try {
        const status = req.query.status as AmendmentStatus | undefined;
        const quarter = req.query.quarter ? Number(req.query.quarter) : undefined;
        const classId = req.query.classId ? Number(req.query.classId) : undefined;

        const requests = await getAmendmentRequestsService(req.user!, {
            status,
            quarter,
            classId
        });

        res.status(200).json(
            SuccessResponse({
                message: "Your amendment requests retrieved successfully",
                data: requests
            })
        );
    } catch (err) {
        next(err);
    }
}

// GET /api/amendments/requests
export async function getAllAmendmentRequestsController(
    req: Request,
    res: Response,
    next: NextFunction
) {
    try {
        const status = req.query.status as AmendmentStatus | undefined;
        const quarter = req.query.quarter ? Number(req.query.quarter) : undefined;
        const classId = req.query.classId ? Number(req.query.classId) : undefined;

        const requests = await getAmendmentRequestsService(req.user!, {
            status,
            quarter,
            classId
        });

        res.status(200).json(
            SuccessResponse({
                message: "Amendment requests retrieved successfully",
                data: requests
            })
        );
    } catch (err) {
        next(err);
    }
}

// GET /api/amendments/requests/:id
export async function getAmendmentRequestByIdController(
    req: Request<{ id: string }>,
    res: Response,
    next: NextFunction
) {
    try {
        const id = Number(req.params.id);
        if (Number.isNaN(id)) {
            throw new BadRequestError("Invalid amendment request id");
        }

        const request = await getAmendmentRequestByIdService(req.user!, id);

        res.status(200).json(
            SuccessResponse({
                message: "Amendment request details retrieved successfully",
                data: request
            })
        );
    } catch (err) {
        next(err);
    }
}

// POST /api/amendments/requests/:id/approve
export async function approveAmendmentRequestController(
    req: Request<{ id: string }, {}, { durationHours?: number }>,
    res: Response,
    next: NextFunction
) {
    try {
        const id = Number(req.params.id);
        if (Number.isNaN(id)) {
            throw new BadRequestError("Invalid amendment request id");
        }

        const durationHours = req.body.durationHours ? Number(req.body.durationHours) : 24;
        if (Number.isNaN(durationHours) || durationHours < 1 || durationHours > 168) {
            throw new BadRequestError("durationHours must be between 1 and 168 hours (7 days)");
        }

        const clientMeta = {
            ipAddress: req.ip || req.socket.remoteAddress || null,
            userAgent: req.headers["user-agent"] || null
        };

        const result = await reviewAmendmentRequestService(
            req.user!,
            id,
            "approved",
            null,
            durationHours,
            clientMeta
        );

        res.status(200).json(
            SuccessResponse({
                message: `Amendment request approved with a ${durationHours}-hour edit window`,
                data: result
            })
        );
    } catch (err) {
        next(err);
    }
}

// POST /api/amendments/requests/:id/reject
export async function rejectAmendmentRequestController(
    req: Request<{ id: string }, {}, { reason?: string; rejectionReason?: string }>,
    res: Response,
    next: NextFunction
) {
    try {
        const id = Number(req.params.id);
        const reason = req.body.reason ?? req.body.rejectionReason;

        if (Number.isNaN(id)) {
            throw new BadRequestError("Invalid amendment request id");
        }
        if (!reason || reason.trim().length === 0) {
            throw new BadRequestError("A rejection reason is required");
        }

        const clientMeta = {
            ipAddress: req.ip || req.socket.remoteAddress || null,
            userAgent: req.headers["user-agent"] || null
        };

        const result = await reviewAmendmentRequestService(
            req.user!,
            id,
            "rejected",
            reason.trim(),
            24,
            clientMeta
        );

        res.status(200).json(
            SuccessResponse({
                message: "Amendment request rejected",
                data: result
            })
        );
    } catch (err) {
        next(err);
    }
}

// POST /api/amendments/requests/:id/revoke
export async function revokeAmendmentRequestController(
    req: Request<{ id: string }>,
    res: Response,
    next: NextFunction
) {
    try {
        const id = Number(req.params.id);
        if (Number.isNaN(id)) {
            throw new BadRequestError("Invalid amendment request id");
        }

        const clientMeta = {
            ipAddress: req.ip || req.socket.remoteAddress || null,
            userAgent: req.headers["user-agent"] || null
        };

        const result = await revokeAmendmentRequestService(req.user!, id, clientMeta);

        res.status(200).json(
            SuccessResponse({
                message: "Amendment permission revoked",
                data: result
            })
        );
    } catch (err) {
        next(err);
    }
}

// GET /api/amendments/audit-logs
export async function getAmendmentAuditLogsController(
    req: Request,
    res: Response,
    next: NextFunction
) {
    try {
        const quarter = req.query.quarter ? Number(req.query.quarter) : undefined;
        const recordType = req.query.recordType as string | undefined;
        const actorUserId = req.query.actorUserId ? Number(req.query.actorUserId) : undefined;
        const limit = req.query.limit ? Number(req.query.limit) : 50;
        const offset = req.query.offset ? Number(req.query.offset) : 0;

        const auditModel = new AmendmentAuditModel();
        const logs = await auditModel.getAuditHistory({
            quarter,
            recordType,
            actorUserId,
            limit,
            offset
        });

        res.status(200).json(
            SuccessResponse({
                message: "Amendment audit logs retrieved successfully",
                data: logs
            })
        );
    } catch (err) {
        next(err);
    }
}

// POST /api/amendments/subject-record
export async function submitSubjectRecordAmendmentController(
    req: Request,
    res: Response,
    next: NextFunction
) {
    try {
        const { enrollmentId, classSubjectId, quarter, reason, changes } = req.body;
        const rawClassId = req.body.classId;

        if (!enrollmentId || Number.isNaN(Number(enrollmentId))) {
            throw new BadRequestError("Valid enrollmentId is required");
        }
        if (!classSubjectId || Number.isNaN(Number(classSubjectId))) {
            throw new BadRequestError("Valid classSubjectId is required");
        }

        const classId = rawClassId ? Number(rawClassId) : 0;
        const numQuarters = await getNumQuarters();
        const parsedQuarter = Number(quarter);
        if (Number.isNaN(parsedQuarter) || !isValidQuarter(parsedQuarter, numQuarters)) {
            throw new BadRequestError(`Quarter must be between 1 and ${numQuarters}`);
        }
        if (!reason || reason.trim().length < 5) {
            throw new BadRequestError("A detailed reason of at least 5 characters is required");
        }
        if (!changes || typeof changes !== "object") {
            throw new BadRequestError("Changes object is required");
        }

        const clientMeta = {
            ipAddress: req.ip || req.socket.remoteAddress || null,
            userAgent: req.headers["user-agent"] || null
        };

        const result = await submitAmendmentRequestService(
            req.user!,
            {
                enrollmentId: Number(enrollmentId),
                classSubjectId: Number(classSubjectId),
                classId,
                quarter: parsedQuarter,
                recordType: "subject_record",
                reason: reason.trim(),
                details: {
                    changes,
                    classSubjectId: Number(classSubjectId),
                    quarter: parsedQuarter,
                    ...req.body.details
                }
            },
            clientMeta
        );

        res.status(201).json(
            SuccessResponse({
                message: "Subject amendment request submitted successfully",
                data: result
            })
        );
    } catch (err) {
        next(err);
    }
}

// POST /api/student-records/amendments/:permissionId/apply
// or POST /api/amendments/:permissionId/apply
export async function applyUnifiedSubjectAmendmentController(
    req: Request<{ permissionId: string }>,
    res: Response,
    next: NextFunction
) {
    try {
        const permissionId = Number(req.params.permissionId);
        if (Number.isNaN(permissionId) || permissionId <= 0) {
            throw new BadRequestError("Invalid permission id");
        }

        const clientMeta = {
            ipAddress: req.ip || req.socket.remoteAddress || null,
            userAgent: req.headers["user-agent"] || null
        };

        const result = await applyUnifiedSubjectAmendmentService(
            req.user!,
            permissionId,
            { changes: req.body.changes },
            clientMeta
        );

        res.status(200).json(
            SuccessResponse({
                message: "Amendment applied and record recalculated successfully",
                data: result
            })
        );
    } catch (err) {
        next(err);
    }
}

