import type { Request, Response, NextFunction } from "express";

import { getDashboardSummaryService } from "../service/dashboard.js";
import { SuccessResponse } from "../helper/response.js";

export async function getDashboardSummaryController(req: Request, res: Response, next: NextFunction) {
    try {
        const summary = await getDashboardSummaryService();
        res.status(200).json(
            SuccessResponse({
                message: "Dashboard summary retrieved successfully",
                data: summary,
            })
        );
    } catch (err) {
        next(err);
    }
}
