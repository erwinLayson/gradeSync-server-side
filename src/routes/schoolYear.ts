import {Router, type RequestHandler} from "express";
import { getSchoolYearController, createSchoolYearController, activateSchoolYearController } from "../controller/schoolYear.js";

// Role-based access control
import allowedRoles from "../middleware/allowedRoles.js";
import { ValidateToken } from "../middleware/validateToken.js";
import { ROLES } from "../constant/users.js";

const router: Router = Router();

const adminOnly: RequestHandler[] = [ValidateToken, allowedRoles([ROLES.ADMIN])];
const adminOnlyWithId: RequestHandler<{id: number}>[] = [ValidateToken, allowedRoles([ROLES.ADMIN])];
const adminTeacher: RequestHandler[] = [ValidateToken, allowedRoles([ROLES.ADMIN, ROLES.TEACHER])];

// ==================== ADMIN ONLY ====================
router.post("/schoolYear", adminOnly, createSchoolYearController);
router.patch("/schoolYear/:id/activate", adminOnlyWithId, activateSchoolYearController);

// ==================== ADMIN + TEACHER ====================
router.get("/schoolYear", adminTeacher, getSchoolYearController);

export default router;