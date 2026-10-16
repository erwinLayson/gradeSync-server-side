import {Router, type RequestHandler} from "express";
import {getClassStudentsByClassIdController} from "../controller/class_students.js";

// Role-based access control
import allowedRoles from "../middleware/allowedRoles.js";
import { allowedFacultyRoles } from "../middleware/allowedFacultyRoles.js";
import { ValidateToken } from "../middleware/validateToken.js";
import { ROLES } from "../constant/users.js";
import { FACULTY_ROLES } from "../constant/faculties.js";

const router: Router = Router();

const adminFacultyWithClassId: RequestHandler<{classId: number}>[] = [
    ValidateToken,
    allowedRoles([ROLES.ADMIN, ROLES.TEACHER]),
    allowedFacultyRoles([FACULTY_ROLES.TEACHER], { allowAdmin: true }),
];

// ==================== ADMIN + TEACHER ====================
router.get("/class/:classId/students", adminFacultyWithClassId, getClassStudentsByClassIdController);

export default router;