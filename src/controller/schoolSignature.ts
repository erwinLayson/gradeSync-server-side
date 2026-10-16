import type { Request, Response, NextFunction } from "express";

import { getSchoolSignatureService, saveSchoolSignatureService } from "../service/schoolSignature.js";
import { SuccessResponse } from "../helper/response.js";
import { BadRequestError } from "../middleware/errors.js";

// GET /api/school-info/signature
// Returns the saved signature (or null) for the school.
export async function getSchoolSignatureController(_req: Request, res: Response, next: NextFunction) {
    try {
        const signature = await getSchoolSignatureService();
        res.status(200).json(
            SuccessResponse({
                message: "School signature retrieved successfully",
                data: { signature }
            })
        );
    } catch (err) {
        next(err);
    }
}

// POST /api/school-info/signature
// Accepts the signature as multipart/form-data (field "image") and replaces the
// stored one. Admin only — enforced by the route middleware.
export async function saveSchoolSignatureController(req: Request, res: Response, next: NextFunction) {
    try {
        const file = req.file;
        if (!file) {
            throw new BadRequestError('No signature file found — send multipart/form-data with an "image" field');
        }

        const signature = await saveSchoolSignatureService({ buffer: file.buffer }, req.user?.id ?? null);
        res.status(200).json(
            SuccessResponse({
                message: "Signature saved successfully",
                data: { signature }
            })
        );
    } catch (err) {
        next(err);
    }
}
