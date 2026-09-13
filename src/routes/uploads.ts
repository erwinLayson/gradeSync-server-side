import path from "path";
import crypto from "crypto";
import { mkdir, writeFile } from "fs/promises";

import multer from "multer";
import express, { Router as expressRouter } from "express";
import type { NextFunction, Request, RequestHandler, Response, Router } from "express";

import getEnv from "../helper/getEnv.js";
import { BadRequestError, InternalServerError } from "../middleware/errors.js";
import { extensionForFormat, sniffImageFormat } from "../helper/imageValidation.js";
import { SuccessResponse } from "../helper/response.js";
import { ROLES } from "../constant/users.js";
import { ValidateToken } from "../middleware/validateToken.js";
import allowedRoles from "../middleware/allowedRoles.js";

/*
 * POST /api/uploads — developer only. Field name: "image".
 * GET  /api/uploads/<file> — public static serving of the uploads directory.
 *
 * Security (plan §6.3):
 *   - Memory storage: the buffer is sniffed with magic bytes BEFORE anything
 *     touches disk; disallowed content never lands in the uploads dir.
 *   - MIME whitelist jpeg/png/webp, 5 MB cap. SVG is deliberately rejected
 *     (stored SVG is an XSS vector via <script>).
 *   - Filenames are server-generated UUIDs; the client's filename is ignored.
 *   - The uploads dir is configured via UPLOAD_DIR (git-ignored).
 *
 * Returns an ABSOLUTE url built from SERVER_ORIGIN, because the client runs
 * on a different origin and must be able to load/store the image directly.
 */

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB

const ALLOWED_MIME_TYPES = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
]);

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: MAX_UPLOAD_BYTES,
        files: 1,
    },
    fileFilter: (_req, file, cb) => {
        if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
            cb(new BadRequestError("Only JPEG, PNG or WebP images are allowed"));
            return;
        }
        cb(null, true);
    },
});

// Deferred env read: ESM evaluates route modules BEFORE app.ts's
// dotenv.config() runs, so getEnv() at module-load time would crash the
// process. A safe default keeps boot deterministic; SERVER_ORIGIN stays
// strict but is only read per-request (also after dotenv has run).
export function getUploadsDir(): string {
    return process.env.UPLOAD_DIR ?? "./uploads";
}

function buildAbsoluteUploadUrl(filename: string): string {
    const origin = getEnv("SERVER_ORIGIN").replace(/\/$/, "");
    return `${origin}/api/uploads/${filename}`;
}

const developerOnly: RequestHandler[] = [ValidateToken, allowedRoles([ROLES.DEVELOPER])];

const router: Router = expressRouter();

// Multer's own errors (file too large, unexpected field, filter rejections)
// arrive via next(err) — map the well-known ones to 400 instead of leaking a 500.
function handleMulterError(err: unknown, next: NextFunction) {
    if (err instanceof multer.MulterError) {
        const message =
            err.code === "LIMIT_FILE_SIZE"
                ? `Image exceeds the ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB size limit`
                : `Upload rejected: ${err.code}`;
        next(new BadRequestError(message));
        return;
    }
    next(err);
}

router.post(
    "/uploads",
    developerOnly,
    (req: Request, res: Response, next: NextFunction) => {
        upload.single("image")(req, res, (err) => handleMulterError(err, next));
    },
    async (req: Request, res: Response, next: NextFunction) => {
    try {
        const file = req.file;
        if (!file) {
            throw new BadRequestError('No image uploaded — send multipart/form-data with an "image" field');
        }

        // Magic-byte check: the declared mimetype is client-controlled, the
        // bytes are not. Reject SVG/HTML/anything else disguised as an image.
        const format = sniffImageFormat(file.buffer);
        if (!format) {
            throw new BadRequestError("File content is not a valid JPEG, PNG or WebP image");
        }

        // If the bytes say JPEG but the browser declared .png, trust the
        // bytes — the canonical extension comes from the sniff.
        const filename = `${crypto.randomUUID()}${extensionForFormat(format)}`;
        const uploadsDir = getUploadsDir();

        // Fully written BEFORE responding — no partial-file races.
        await mkdir(uploadsDir, { recursive: true });
        await writeFile(path.join(uploadsDir, filename), file.buffer);

        res.status(201).json(
            SuccessResponse({
                message: "Image uploaded successfully",
                data: {
                    url: buildAbsoluteUploadUrl(filename),
                    filename,
                    size: file.size,
                    format,
                },
            })
        );
    } catch (err) {
        next(err);
    }
});

// Public static serving of the uploads directory. index: false prevents
// directory listing; the UUID filenames are unguessable. Created lazily on
// the first request so the env var is read after dotenv.config() has run.
let uploadsStatic: ReturnType<typeof express.static> | null = null;
router.use("/uploads", (req, res, next) => {
    if (!uploadsStatic) {
        uploadsStatic = express.static(getUploadsDir(), { index: false, maxAge: "1h" });
    }
    uploadsStatic(req, res, next);
});

export default router;
