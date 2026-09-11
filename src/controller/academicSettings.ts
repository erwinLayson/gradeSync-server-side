import type { Request, Response, NextFunction } from "express";

import { getAcademicSettingsService, updateAcademicSettingsService } from "../service/academicSettings.js";
import { SuccessResponse } from "../helper/response.js";
import { BadRequestError } from "../middleware/errors.js";

import type { AcademicSettingsUpdateProps } from "../constant/academicSettings.js";

// GET /api/academic-settings
// Returns the current quarter and enrollment status.
export async function getAcademicSettingsController(_req: Request, res: Response, next: NextFunction) {
    try {
        const settings = await getAcademicSettingsService();
        res.status(200).json(
            SuccessResponse({
                message: "Academic settings retrieved successfully",
                data: settings
            })
        );
    } catch (err) {
        next(err);
    }
}

// PATCH /api/academic-settings
// Updates currentQuarter (1-4) and/or enrollmentOpen (0/1).
export async function updateAcademicSettingsController(req: Request<{}, {}, AcademicSettingsUpdateProps>, res: Response, next: NextFunction) {
    try {
        const updates = req.body;

        if (updates.currentQuarter !== undefined) {
            const quarter = Number(updates.currentQuarter);
            if (!Number.isInteger(quarter) || quarter < 1 || quarter > 4) {
                throw new BadRequestError("currentQuarter must be an integer between 1 and 4");
            }
            updates.currentQuarter = quarter;
        }

        if (updates.enrollmentOpen !== undefined) {
            const open = Number(updates.enrollmentOpen);
            if (open !== 0 && open !== 1) {
                throw new BadRequestError("enrollmentOpen must be 0 or 1");
            }
            updates.enrollmentOpen = open;
        }

        if (updates.submissionsLocked !== undefined) {
            const locked = Number(updates.submissionsLocked);
            if (locked !== 0 && locked !== 1) {
                throw new BadRequestError("submissionsLocked must be 0 or 1");
            }
            updates.submissionsLocked = locked;
        }

        const updated = await updateAcademicSettingsService(updates);
        res.status(200).json(
            SuccessResponse({
                message: "Academic settings updated successfully",
                data: updated
            })
        );
    } catch (err) {
        next(err);
    }
}
