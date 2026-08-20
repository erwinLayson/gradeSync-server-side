import type { Request, Response, NextFunction } from "express";

import { getSchoolInfoService, updateSchoolInfoService } from "../service/schoolInfo.js";
import { SuccessResponse } from "../helper/response.js";
import { BadRequestError } from "../middleware/errors.js";

import type { SchoolInfoUpdateProps } from "../constant/schoolInfo.js";

// GET /api/school-info
// Returns the single school information record.
export async function getSchoolInfoController(req: Request, res: Response, next: NextFunction) {
    try {
        const schoolInfo = await getSchoolInfoService();
        res.status(200).json(
            SuccessResponse({
                message: "School information retrieved successfully",
                data: schoolInfo
            })
        );
    } catch (err) {
        next(err);
    }
}

// PATCH /api/school-info
// Updates the editable fields of the school information record.
export async function updateSchoolInfoController(req: Request<{}, {}, SchoolInfoUpdateProps>, res: Response, next: NextFunction) {
    try {
        const updates = req.body;

        // schoolId must be a positive number when provided.
        if (updates.schoolId !== undefined) {
            const parsedSchoolId = Number(updates.schoolId);
            if (Number.isNaN(parsedSchoolId) || parsedSchoolId <= 0) {
                throw new BadRequestError("School ID must be a valid number");
            }
            updates.schoolId = parsedSchoolId;
        }

        // Required text fields cannot be blanked out.
        for (const field of ["name", "district", "division", "region"] as const) {
            if (updates[field] !== undefined && String(updates[field]).trim() === "") {
                throw new BadRequestError(`Invalid ${field}`);
            }
        }

        const updated = await updateSchoolInfoService(updates);
        res.status(200).json(
            SuccessResponse({
                message: "School information updated successfully",
                data: updated
            })
        );
    } catch (err) {
        next(err);
    }
}
