import { Router, type RequestHandler } from "express";

import { getAcademicSettingsController, updateAcademicSettingsController } from "../controller/academicSettings.js";

// Role-based access control
import allowedRoles from "../middleware/allowedRoles.js";
import { ValidateToken } from "../middleware/validateToken.js";
import { ROLES } from "../constant/users.js";

const router: Router = Router();

const adminOnly: RequestHandler[] = [ValidateToken, allowedRoles([ROLES.ADMIN])];

// ==================== ADMIN ONLY ====================
router.get("/academic-settings", adminOnly, getAcademicSettingsController);
router.patch("/academic-settings", adminOnly, updateAcademicSettingsController);

export default router;
