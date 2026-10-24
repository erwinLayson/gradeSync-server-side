import { Router, type NextFunction, type RequestHandler } from "express";
import multer from "multer";

import { getSchoolInfoController, updateSchoolInfoController } from "../controller/schoolInfo.js";
import { getSchoolSignatureController, saveSchoolSignatureController } from "../controller/schoolSignature.js";
import { getSchoolLogoController, saveSchoolLogoController } from "../controller/schoolLogo.js";

// Role-based access control
import allowedRoles from "../middleware/allowedRoles.js";
import { ValidateToken } from "../middleware/validateToken.js";
import { ROLES } from "../constant/users.js";

import { BadRequestError } from "../middleware/errors.js";
import { ALLOWED_SIGNATURE_MIME_TYPES, MAX_SIGNATURE_BYTES } from "../constant/schoolSignature.js";
import { ALLOWED_LOGO_MIME_TYPES, MAX_LOGO_BYTES } from "../constant/schoolLogo.js";

const router: Router = Router();

// The school name and logo are shown in the sidebar/header for every role, so
// reads are open to any authenticated user; only admins may edit the record.
const authenticated: RequestHandler[] = [ValidateToken];
const adminOnly: RequestHandler[] = [ValidateToken, allowedRoles([ROLES.ADMIN])];

// School images arrive as multipart/form-data (field "image"): a canvas PNG or a
// high-resolution logo can exceed express.json()'s 100 kB body limit and
// shouldn't be base64-inflated. Memory storage keeps the bytes off the
// (ephemeral) disk - the service sniffs the magic bytes and persists them in
// the database.
const ALLOWED_IMAGE_MIME_SET = new Set([
    ...ALLOWED_SIGNATURE_MIME_TYPES,
    ...ALLOWED_LOGO_MIME_TYPES,
]);
const MAX_IMAGE_BYTES = Math.max(MAX_SIGNATURE_BYTES, MAX_LOGO_BYTES);

const schoolImageUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: MAX_IMAGE_BYTES,
        files: 1,
    },
    fileFilter: (_req, file, cb) => {
        if (!ALLOWED_IMAGE_MIME_SET.has(file.mimetype)) {
            cb(new BadRequestError("Only PNG, JPEG or WebP images are allowed"));
            return;
        }
        cb(null, true);
    },
});

// Multer's own errors (file too large, unexpected field, filter rejections) come
// through next(err) - map the well-known ones to 400 instead of leaking a 500.
function handleMulterError(err: unknown, next: NextFunction) {
    if (err instanceof multer.MulterError) {
        const message =
            err.code === "LIMIT_FILE_SIZE"
                ? `Image exceeds the ${MAX_IMAGE_BYTES / (1024 * 1024)} MB size limit`
                : `Upload rejected: ${err.code}`;
        next(new BadRequestError(message));
        return;
    }
    next(err);
}

const multerSingleSchoolImage: RequestHandler = (req, res, next) => {
    schoolImageUpload.single("image")(req, res, (err) => handleMulterError(err, next));
};

// ==================== PUBLIC ====================
// The logo is public branding shown on the login and landing pages before a
// user signs in. It contains no student or staff data.
router.get("/school-info/logo", getSchoolLogoController);

// ==================== AUTHENTICATED (ANY ROLE) ====================
router.get("/school-info", authenticated, getSchoolInfoController);
// The saved signature is readable by any authenticated user so official
// documents can render it; only admins may change it.
router.get("/school-info/signature", authenticated, getSchoolSignatureController);

// ==================== ADMIN ONLY ====================
router.patch("/school-info", adminOnly, updateSchoolInfoController);
router.post("/school-info/signature", adminOnly, multerSingleSchoolImage, saveSchoolSignatureController);
router.post("/school-info/logo", adminOnly, multerSingleSchoolImage, saveSchoolLogoController);

export default router;
