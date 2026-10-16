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
// Register picks the enrollment school year from the list. Creating and
// activating a school year stay Admin-only (docs/register-role-implementation-plan.md §6.2).
const adminTeacherRegister: RequestHandler[] = [ValidateToken, allowedRoles([ROLES.ADMIN, ROLES.TEACHER, ROLES.REGISTER])];

// ==================== ADMIN ONLY ====================
router.post("/schoolYear", adminOnly, createSchoolYearController);
router.patch("/schoolYear/:id/activate", adminOnlyWithId, activateSchoolYearController);

// ==================== ADMIN + TEACHER + REGISTER (read list) ====================
// Register picks the enrollment school year from the list. Creating and
// activating a school year stay Admin-only (docs/register-role-implementation-plan.md §6.2).
router.get("/schoolYear", adminTeacherRegister, getSchoolYearController);

export default router;