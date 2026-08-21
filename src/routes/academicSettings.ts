import { Router, type RequestHandler } from "express";

import { getAcademicSettingsController, updateAcademicSettingsController } from "../controller/academicSettings.js";

// Role-based access control
import allowedRoles from "../middleware/allowedRoles.js";
import { ValidateToken } from "../middleware/validateToken.js";
import { ROLES } from "../constant/users.js";

const router: Router = Router();

const adminOnly: RequestHandler[] = [ValidateToken, allowedRoles([ROLES.ADMIN])];
const adminTeacher: RequestHandler[] = [ValidateToken, allowedRoles([ROLES.ADMIN, ROLES.TEACHER])];

// ==================== ADMIN + TEACHER (read-only) ====================
router.get("/academic-settings", adminTeacher, getAcademicSettingsController);

// ==================== ADMIN ONLY ====================
router.patch("/academic-settings", adminOnly, updateAcademicSettingsController);

export default router;
