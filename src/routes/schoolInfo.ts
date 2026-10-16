import { Router, type NextFunction, type RequestHandler } from "express";
import multer from "multer";

import { getSchoolInfoController, updateSchoolInfoController } from "../controller/schoolInfo.js";
import { getSchoolSignatureController, saveSchoolSignatureController } from "../controller/schoolSignature.js";

// Role-based access control
import allowedRoles from "../middleware/allowedRoles.js";
import { ValidateToken } from "../middleware/validateToken.js";
import { ROLES } from "../constant/users.js";

import { BadRequestError } from "../middleware/errors.js";
import { ALLOWED_SIGNATURE_MIME_TYPES, MAX_SIGNATURE_BYTES } from "../constant/schoolSignature.js";

const router: Router = Router();

// The school name is shown in the sidebar/header for every role, so reads are
// open to any authenticated user; only admins may edit the record.
const authenticated: RequestHandler[] = [ValidateToken];
const adminOnly: RequestHandler[] = [ValidateToken, allowedRoles([ROLES.ADMIN])];

// The signature arrives as multipart/form-data (field "image"): a canvas PNG can
// exceed express.json()'s 100 kB body limit and shouldn't be base64-inflated.
// Memory storage keeps the bytes off the (ephemeral) disk — the service sniffs
// the magic bytes and persists them in the database.
const ALLOWED_SIGNATURE_MIME_SET = new Set(ALLOWED_SIGNATURE_MIME_TYPES);

const signatureUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: MAX_SIGNATURE_BYTES,
        files: 1,
    },
    fileFilter: (_req, file, cb) => {
        if (!ALLOWED_SIGNATURE_MIME_SET.has(file.mimetype)) {
            cb(new BadRequestError("Only PNG, JPEG or WebP images are allowed"));
            return;
        }
        cb(null, true);
    },
});

// Multer's own errors (file too large, unexpected field, filter rejections) come
// through next(err) — map the well-known ones to 400 instead of leaking a 500.
function handleMulterError(err: unknown, next: NextFunction) {
    if (err instanceof multer.MulterError) {
        const message =
            err.code === "LIMIT_FILE_SIZE"
                ? `Signature exceeds the ${MAX_SIGNATURE_BYTES / (1024 * 1024)} MB size limit`
                : `Upload rejected: ${err.code}`;
        next(new BadRequestError(message));
        return;
    }
    next(err);
}

const multerSingleSignature: RequestHandler = (req, res, next) => {
    signatureUpload.single("image")(req, res, (err) => handleMulterError(err, next));
};

// ==================== AUTHENTICATED (ANY ROLE) ====================
router.get("/school-info", authenticated, getSchoolInfoController);
// The saved signature is readable by any authenticated user so official documents
// can render it; only admins may change it.
router.get("/school-info/signature", authenticated, getSchoolSignatureController);

// ==================== ADMIN ONLY ====================
router.patch("/school-info", adminOnly, updateSchoolInfoController);
router.post("/school-info/signature", adminOnly, multerSingleSignature, saveSchoolSignatureController);

export default router;
