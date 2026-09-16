import type { Request, Response, NextFunction } from "express";

import { buildUploadUrl, saveUploadService } from "../service/upload.js";
import { BadRequestError } from "../middleware/errors.js";
import { SuccessResponse } from "../helper/response.js";

// POST /api/uploads — developer only (enforced by route middleware).
// multer (route level) has already parsed the multipart body and validated
// the MIME whitelist + size cap; this controller persists the file and
// responds with the absolute URL.
export async function uploadImageController(req: Request, res: Response, next: NextFunction) {
    try {
        const file = req.file;
        if (!file) {
            throw new BadRequestError('No image uploaded — send multipart/form-data with an "image" field');
        }

        const saved = await saveUploadService(file);

        res.status(201).json(
            SuccessResponse({
                message: "Image uploaded successfully",
                data: {
                    url: buildUploadUrl(req, saved.filename),
                    filename: saved.filename,
                    size: saved.size,
                    format: saved.format,
                },
            })
        );
    } catch (err) {
        next(err);
    }
}