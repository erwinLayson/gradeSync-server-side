import express, { Router } from "express";
import type { NextFunction, RequestHandler } from "express";

import multer from "multer";

import { uploadImageController } from "../controller/upload.js";
import { getUploadsDir } from "../service/upload.js";
import { BadRequestError } from "../middleware/errors.js";
import { ROLES } from "../constant/users.js";
import { ValidateToken } from "../middleware/validateToken.js";
import allowedRoles from "../middleware/allowedRoles.js";

/*
 * POST /api/uploads — developer only. Field name: "image".
 * GET  /api/uploads/<file> — public static serving of the uploads directory.
 *
 * Transport config (multer) stays here; persistence + URL building live in
 * the service/controller (same layering as the other routes).
 *
 * Security (plan §6.3):
 *   - Memory storage: the buffer is sniffed with magic bytes BEFORE anything
 *     touches disk; disallowed content never lands in the uploads dir.
 *   - MIME whitelist jpeg/png/webp, 5 MB cap. SVG is deliberately rejected
 *     (stored SVG is an XSS vector via <script>).
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

const developerOnly: RequestHandler[] = [ValidateToken, allowedRoles([ROLES.DEVELOPER])];

const router: Router = Router();

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

// Single-file middleware that funnels multer's callback-style errors into the
// Express error pipeline before the controller runs.
const multerSingleImage: RequestHandler = (req, res, next) => {
    upload.single("image")(req, res, (err) => handleMulterError(err, next));
};

router.post("/uploads", developerOnly, multerSingleImage, uploadImageController);

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