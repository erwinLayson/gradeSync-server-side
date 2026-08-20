import { Router, type RequestHandler } from "express";

import { getSchoolInfoController, updateSchoolInfoController } from "../controller/schoolInfo.js";

// Role-based access control
import allowedRoles from "../middleware/allowedRoles.js";
import { ValidateToken } from "../middleware/validateToken.js";
import { ROLES } from "../constant/users.js";

const router: Router = Router();

// The school name is shown in the sidebar/header for every role, so reads are
// open to any authenticated user; only admins may edit the record.
const authenticated: RequestHandler[] = [ValidateToken];
const adminOnly: RequestHandler[] = [ValidateToken, allowedRoles([ROLES.ADMIN])];

// ==================== AUTHENTICATED (ANY ROLE) ====================
router.get("/school-info", authenticated, getSchoolInfoController);

// ==================== ADMIN ONLY ====================
router.patch("/school-info", adminOnly, updateSchoolInfoController);

export default router;
