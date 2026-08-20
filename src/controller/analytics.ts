import type { Request, Response, NextFunction } from "express";

import { getAnalyticsService } from "../service/analytics.js";
import { SuccessResponse } from "../helper/response.js";

// GET /api/analytics?schoolYearId=:schoolYearId
// Aggregated dashboard metrics. The schoolYearId query parameter is optional;
// when absent every metric spans all school years.
export async function getAnalyticsController(req: Request, res: Response, next: NextFunction) {
    const rawSchoolYearId = req.query.schoolYearId;
    let schoolYearId: number | undefined;

    if (rawSchoolYearId !== undefined && rawSchoolYearId !== "") {
        const parsed = Number(rawSchoolYearId);
        if (Number.isNaN(parsed)) {
            res.status(400).json({ success: false, message: "schoolYearId query parameter must be a number" });
            return;
        }
        schoolYearId = parsed;
    }

    try {
        const analytics = await getAnalyticsService(schoolYearId);
        res.status(200).json(
            SuccessResponse({
                message: "Analytics retrieved successfully",
                data: analytics
            })
        );
    } catch (err) {
        next(err);
    }
}
