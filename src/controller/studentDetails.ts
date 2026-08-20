import type { Response, Request, NextFunction } from "express";

import type { StudentDetailsUpdateProps } from "../constant/studentDetails.js";
import { AllowedStudentDetailsFields, GUARDIAN_RELATIONS } from "../constant/studentDetails.js";

import {
    getMyStudentProfileService,
    updateMyStudentDetailsService
} from "../service/studentDetails.js";

// Helpers
import { SuccessResponse } from "../helper/response.js";
import { BadRequestError } from "../middleware/errors.js";

// GET /students/details — the logged-in student's own record + additional info.
export async function getMyStudentProfileController(
    req: Request,
    res: Response,
    next: NextFunction
) {
    try {
        const userId = req.user?.id;
        if (!userId) {
            throw new BadRequestError("Missing user context");
        }

        const result = await getMyStudentProfileService(userId);

        return res.status(200).json(
            SuccessResponse({
                message: "Student profile retrieved successfully",
                data: result
            })
        );
    } catch (err) {
        next(err);
    }
}

// PATCH /students/details — the logged-in student updates their own additional info.
export async function updateMyStudentDetailsController(
    req: Request<{}, {}, StudentDetailsUpdateProps>,
    res: Response,
    next: NextFunction
) {
    try {
        const userId = req.user?.id;
        if (!userId) {
            throw new BadRequestError("Missing user context");
        }

        // Normalize: trim strings, convert blank input to null (all fields optional).
        const details: StudentDetailsUpdateProps = {};
        for (const field of AllowedStudentDetailsFields) {
            const value = req.body[field];
            if (value === undefined) {
                continue;
            }
            (details as any)[field] = typeof value === "string" ? value.trim() || null : value;
        }

        if (Object.keys(details).length === 0) {
            throw new BadRequestError("No fields to update");
        }

        if (
            details.guardianRelation !== undefined &&
            details.guardianRelation !== null &&
            !(GUARDIAN_RELATIONS as readonly string[]).includes(details.guardianRelation)
        ) {
            throw new BadRequestError(
                `Invalid guardianRelation. Choose one of: ${GUARDIAN_RELATIONS.join(", ")}`
            );
        }

        const result = await updateMyStudentDetailsService(userId, details);

        return res.status(200).json(
            SuccessResponse({
                message: "Student details updated successfully",
                data: result
            })
        );
    } catch (err) {
        next(err);
    }
}
