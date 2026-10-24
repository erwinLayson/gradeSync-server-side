import type { Request, Response, NextFunction } from "express";

import { getSchoolLogoService, saveSchoolLogoService } from "../service/schoolLogo.js";
import { SuccessResponse } from "../helper/response.js";
import { BadRequestError } from "../middleware/errors.js";

// GET /api/school-info/logo
// Returns the saved school logo (or null) for the school.
export async function getSchoolLogoController(_req: Request, res: Response, next: NextFunction) {
    try {
        const logo = await getSchoolLogoService();
        res.status(200).json(
            SuccessResponse({
                message: "School logo retrieved successfully",
                data: { logo }
            })
        );
    } catch (err) {
        next(err);
    }
}

// POST /api/school-info/logo
// Accepts the logo as multipart/form-data (field "image") and replaces the
// stored one. Admin only - enforced by the route middleware.
export async function saveSchoolLogoController(req: Request, res: Response, next: NextFunction) {
    try {
        const file = req.file;
        if (!file) {
            throw new BadRequestError('No logo file found - send multipart/form-data with an "image" field');
        }

        const logo = await saveSchoolLogoService({ buffer: file.buffer }, req.user?.id ?? null);
        res.status(200).json(
            SuccessResponse({
                message: "School logo saved successfully",
                data: { logo }
            })
        );
    } catch (err) {
        next(err);
    }
}
