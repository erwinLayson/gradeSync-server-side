import {Router, type RequestHandler} from "express";
import {getClassStudentsByClassIdController} from "../controller/class_students.js";

// Role-based access control
import allowedRoles from "../middleware/allowedRoles.js";
import { ValidateToken } from "../middleware/validateToken.js";
import { ROLES } from "../constant/users.js";

const router: Router = Router();

const adminTeacherWithClassId: RequestHandler<{classId: number}>[] = [ValidateToken, allowedRoles([ROLES.ADMIN, ROLES.TEACHER])];

// ==================== ADMIN + TEACHER ====================
router.get("/class/:classId/students", adminTeacherWithClassId, getClassStudentsByClassIdController);

export default router;