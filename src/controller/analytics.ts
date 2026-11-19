import type { Request, Response, NextFunction } from "express";

import { getAnalyticsService, getStudentQuarterlyRankingsService } from "../service/analytics.js";
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

// GET /api/analytics/student-rankings?schoolYearId=:id&quarter=:q&gradeLevel=:gl
// Calculates academic rankings of all eligible students per grade level based exclusively
// on officially finalized quarterly general averages.
export async function getStudentQuarterlyRankingsController(req: Request, res: Response, next: NextFunction) {
    const rawSchoolYearId = req.query.schoolYearId;
    const rawQuarter = req.query.quarter;
    const rawGradeLevel = req.query.gradeLevel;

    if (!rawSchoolYearId || rawSchoolYearId === "") {
        res.status(400).json({ success: false, message: "schoolYearId query parameter is required" });
        return;
    }
    const schoolYearId = Number(rawSchoolYearId);
    if (!Number.isInteger(schoolYearId) || schoolYearId <= 0) {
        res.status(400).json({ success: false, message: "schoolYearId query parameter must be a positive integer" });
        return;
    }

    if (!rawQuarter || rawQuarter === "") {
        res.status(400).json({ success: false, message: "quarter query parameter is required" });
        return;
    }
    const quarter = Number(rawQuarter);
    if (!Number.isInteger(quarter) || quarter < 1 || quarter > 4) {
        res.status(400).json({ success: false, message: "quarter query parameter must be an integer between 1 and 4" });
        return;
    }

    let gradeLevel: number | undefined;
    if (rawGradeLevel !== undefined && rawGradeLevel !== "" && rawGradeLevel !== "all") {
        const parsedGradeLevel = Number(rawGradeLevel);
        if (!Number.isInteger(parsedGradeLevel) || parsedGradeLevel <= 0) {
            res.status(400).json({ success: false, message: "gradeLevel query parameter must be a positive integer" });
            return;
        }
        gradeLevel = parsedGradeLevel;
    }

    try {
        const rankings = await getStudentQuarterlyRankingsService(schoolYearId, quarter, gradeLevel);
        res.status(200).json(
            SuccessResponse({
                message: "Student quarterly rankings retrieved successfully",
                data: rankings
            })
        );
    } catch (err) {
        next(err);
    }
}
