import type { Request, Response, NextFunction } from "express";

import { getGradingWeightDefaultsService, updateGradingWeightDefaultsService } from "../service/gradingWeightDefaults.js";
import { SuccessResponse } from "../helper/response.js";
import { BadRequestError } from "../middleware/errors.js";

import type { GradingWeightDefaultsUpdateProps } from "../constant/gradingWeightDefaults.js";

// GET /api/grading-weight-defaults
// Returns the single default-weights record (the fallback for class subjects
// without their own grading_weights row).
export async function getGradingWeightDefaultsController(req: Request, res: Response, next: NextFunction) {
    try {
        const defaults = await getGradingWeightDefaultsService();
        res.status(200).json(
            SuccessResponse({
                message: "Grading weight defaults retrieved successfully",
                data: defaults
            })
        );
    } catch (err) {
        next(err);
    }
}

// PATCH /api/grading-weight-defaults
// Updates the default weights. Each weight must be >= 0 and the four must
// total EXACTLY 100 (DepEd DO 8 s. 2015 component weights sum to 100).
export async function updateGradingWeightDefaultsController(req: Request<{}, {}, GradingWeightDefaultsUpdateProps>, res: Response, next: NextFunction) {
    try {
        const updates = req.body;
        const weightFields: (keyof GradingWeightDefaultsUpdateProps)[] = [
            "writtenWorkWeight",
            "performanceTaskWeight",
            "quarterlyAssessmentWeight",
            "attendanceWeight"
        ];

        let total = 0;
        let hasAny = false;
        for (const field of weightFields) {
            if (updates[field] === undefined) continue;
            hasAny = true;
            const value = Number(updates[field]);
            if (Number.isNaN(value) || value < 0) {
                throw new BadRequestError(`${field} must be a number greater than or equal to 0`);
            }
            updates[field] = value;
            total += value;
        }

        if (!hasAny) {
            throw new BadRequestError("No weight fields provided");
        }

        // Allow tiny float drift, but effectively require the DepEd 100 total.
        if (Math.abs(total - 100) > 0.001) {
            throw new BadRequestError(`Grading weights total ${total}, but they must total exactly 100`);
        }

        const updated = await updateGradingWeightDefaultsService(updates);
        res.status(200).json(
            SuccessResponse({
                message: "Grading weight defaults updated successfully",
                data: updated
            })
        );
    } catch (err) {
        next(err);
    }
}
