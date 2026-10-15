import type { Request, Response, NextFunction } from "express";

import { getAcademicSettingsService, updateAcademicSettingsService } from "../service/academicSettings.js";
import { SuccessResponse } from "../helper/response.js";
import { BadRequestError } from "../middleware/errors.js";

import type { AcademicSettingsUpdateProps } from "../constant/academicSettings.js";
import { isValidQuarter, MAX_QUARTERS, MIN_QUARTERS, parseQuarterInput } from "../helper/quarterValidation.js";

// GET /api/academic-settings
// Returns the current quarter, numQuarters, and enrollment status.
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
// Updates currentQuarter, numQuarters, and/or enrollmentOpen (0/1).
export async function updateAcademicSettingsController(req: Request<{}, {}, AcademicSettingsUpdateProps & { confirmForce?: boolean }>, res: Response, next: NextFunction) {
    try {
        const { confirmForce, ...updates } = req.body;

        // Quarter parsing is strict (no Number() coercion): booleans, null,
        // fractions, and non-numeric strings are rejected rather than being
        // silently turned into a "valid" quarter. The upper bound here is the
        // system maximum — the service additionally enforces the school's
        // configured numQuarters, which the controller cannot know.
        if (updates.currentQuarter !== undefined) {
            const quarter = parseQuarterInput(updates.currentQuarter);
            if (quarter === null || !isValidQuarter(quarter, MAX_QUARTERS)) {
                throw new BadRequestError(`currentQuarter must be an integer between 1 and ${MAX_QUARTERS}`);
            }
            updates.currentQuarter = quarter;
        }

        if (updates.numQuarters !== undefined) {
            const num = parseQuarterInput(updates.numQuarters);
            if (num !== MIN_QUARTERS && num !== MAX_QUARTERS) {
                throw new BadRequestError(`numQuarters must be ${MIN_QUARTERS} or ${MAX_QUARTERS}`);
            }
            updates.numQuarters = num;
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

        const result = await updateAcademicSettingsService(updates, confirmForce);

        // If there's a Q4 data warning, return it so the frontend can show a confirmation dialog
        if (result.quarter4Warning) {
            res.status(200).json(
                SuccessResponse({
                    message: "Quarter 4 contains existing data",
                    data: { ...result.settings, quarter4Warning: result.quarter4Warning.counts }
                })
            );
            return;
        }

        res.status(200).json(
            SuccessResponse({
                message: "Academic settings updated successfully",
                data: result.settings
            })
        );
    } catch (err) {
        next(err);
    }
}
