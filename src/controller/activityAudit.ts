import type { Request, Response, NextFunction } from "express";
import { SuccessResponse } from "../helper/response.js";
import { BadRequestError, NotFoundError } from "../middleware/errors.js";
import {
    getActivityAuditDetailService,
    getActivityAuditLogsService,
    getActivityAuditStatsService,
} from "../service/activityAudit.js";
import type { ActivityAuditFilter, ActivityAuditPagination } from "../constant/activityAudit.js";

export async function getActivityAuditLogsController(req: Request, res: Response, next: NextFunction) {
    try {
        const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
        const limit = Math.max(1, Math.min(100, parseInt(req.query.limit as string, 10) || 20));

        const filters: ActivityAuditFilter = {};

        if (req.query.actorUserId) {
            const parsed = Number(req.query.actorUserId);
            if (!Number.isNaN(parsed)) filters.actorUserId = parsed;
        }

        if (req.query.actorRole && typeof req.query.actorRole === "string" && req.query.actorRole.trim() !== "") {
            filters.actorRole = req.query.actorRole.trim();
        }

        if (req.query.action && typeof req.query.action === "string" && req.query.action.trim() !== "") {
            filters.action = req.query.action.trim();
        }

        if (req.query.entityType && typeof req.query.entityType === "string" && req.query.entityType.trim() !== "") {
            filters.entityType = req.query.entityType.trim();
        }

        if (req.query.schoolYearId) {
            const parsed = Number(req.query.schoolYearId);
            if (!Number.isNaN(parsed)) filters.schoolYearId = parsed;
        }

        if (req.query.gradeLevel) {
            const parsed = Number(req.query.gradeLevel);
            if (!Number.isNaN(parsed)) filters.gradeLevel = parsed;
        }

        if (req.query.classroomId) {
            const parsed = Number(req.query.classroomId);
            if (!Number.isNaN(parsed)) filters.classroomId = parsed;
        }

        if (req.query.subjectId) {
            const parsed = Number(req.query.subjectId);
            if (!Number.isNaN(parsed)) filters.subjectId = parsed;
        }

        if (req.query.quarter) {
            const parsed = Number(req.query.quarter);
            if (!Number.isNaN(parsed)) filters.quarter = parsed;
        }

        if (req.query.status && (req.query.status === "success" || req.query.status === "failed")) {
            filters.status = req.query.status;
        }

        if (req.query.dateFrom && typeof req.query.dateFrom === "string") {
            filters.dateFrom = req.query.dateFrom.trim();
        }

        if (req.query.dateTo && typeof req.query.dateTo === "string") {
            filters.dateTo = req.query.dateTo.trim();
        }

        if (req.query.search && typeof req.query.search === "string" && req.query.search.trim() !== "") {
            filters.search = req.query.search.trim();
        }

        const pagination: ActivityAuditPagination = { page, limit };
        const result = await getActivityAuditLogsService(filters, pagination);

        res.status(200).json(
            SuccessResponse({
                message: "Activity audit logs retrieved successfully",
                data: {
                    logs: result.data,
                    total: result.total,
                    page: result.page,
                    limit: result.limit,
                    totalPages: result.totalPages,
                },
            })
        );
    } catch (err) {
        next(err);
    }
}

export async function getActivityAuditDetailController(
    req: Request<{ id: string }>,
    res: Response,
    next: NextFunction
) {
    try {
        const id = Number(req.params.id);
        if (Number.isNaN(id) || id <= 0) {
            throw new BadRequestError("Invalid audit log ID");
        }

        const audit = await getActivityAuditDetailService(id);
        if (!audit) {
            throw new NotFoundError("Activity audit log not found", 404);
        }

        res.status(200).json(
            SuccessResponse({
                message: "Activity audit log details retrieved successfully",
                data: audit,
            })
        );
    } catch (err) {
        next(err);
    }
}

export async function getActivityAuditStatsController(req: Request, res: Response, next: NextFunction) {
    try {
        const schoolYearId = req.query.schoolYearId ? Number(req.query.schoolYearId) : undefined;
        const stats = await getActivityAuditStatsService(schoolYearId);

        res.status(200).json(
            SuccessResponse({
                message: "Activity audit statistics retrieved successfully",
                data: stats,
            })
        );
    } catch (err) {
        next(err);
    }
}
