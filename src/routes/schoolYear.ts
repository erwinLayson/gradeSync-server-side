import {Router, type RequestHandler} from "express";
import { getSchoolYearController, createSchoolYearController, activateSchoolYearController, setSchoolYearStatusController } from "../controller/schoolYear.js";

// Role-based access control
import allowedRoles from "../middleware/allowedRoles.js";
import { allowedFacultyRoles } from "../middleware/allowedFacultyRoles.js";
import { ValidateToken } from "../middleware/validateToken.js";
import { ROLES } from "../constant/users.js";
import { FACULTY_ROLES } from "../constant/faculties.js";


const router: Router = Router();

const adminOnly: RequestHandler[] = [ValidateToken, allowedRoles([ROLES.ADMIN])];
const adminOnlyWithId: RequestHandler<{id: number}>[] = [ValidateToken, allowedRoles([ROLES.ADMIN])];
// Register picks the enrollment school year from the list. Creating and
// activating a school year stay Admin-only (docs/register-role-implementation-plan.md §6.2).
//
// After the migration there is no user-level `register` role, so the school-year
// read path for register staff is authorized through the authenticated user's
// verified faculty record (`faculties.role === "register"`).
const adminFacultyRegister: RequestHandler[] = [
    ValidateToken,
    allowedRoles([ROLES.ADMIN, ROLES.TEACHER]),
    allowedFacultyRoles([FACULTY_ROLES.TEACHER, FACULTY_ROLES.REGISTER], { allowAdmin: true }),
];

// ==================== ADMIN ONLY ====================
router.post("/schoolYear", adminOnly, createSchoolYearController);
router.patch("/schoolYear/:id/activate", adminOnlyWithId, activateSchoolYearController);
// Officially complete (or reopen) a school year — the gate that unlocks faculty
// role changes (docs/faculty-role-implementation-plan.md §7).
router.patch("/schoolYear/:id/status", adminOnlyWithId, setSchoolYearStatusController);

// ==================== ADMIN + TEACHER + REGISTER (read list) ====================
// Register picks the enrollment school year from the list. Creating and
// activating a school year stay Admin-only (docs/register-role-implementation-plan.md §6.2).
router.get("/schoolYear", adminFacultyRegister, getSchoolYearController);

export default router;