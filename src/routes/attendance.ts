import { Router, type RequestHandler } from "express";

import {
    getAttendanceByClassSubjectAndDateController,
    getAttendanceHistoryController,
    saveAttendanceController,
} from "../controller/attendance.js";

// Role-based access control
import allowedRoles from "../middleware/allowedRoles.js";
import { ValidateToken } from "../middleware/validateToken.js";
import { ROLES } from "../constant/users.js";

const route: Router = Router();

const adminTeacher: RequestHandler[] = [ValidateToken, allowedRoles([ROLES.ADMIN, ROLES.TEACHER])];
const adminTeacherWithEnrollmentId: RequestHandler<{ enrollmentId: number }>[] = [
    ValidateToken,
    allowedRoles([ROLES.ADMIN, ROLES.TEACHER]),
];

// ==================== ADMIN + TEACHER ====================

// Daily attendance recording (per class subject)
route.get("/attendance", adminTeacher, getAttendanceByClassSubjectAndDateController);
route.post("/attendance", adminTeacher, saveAttendanceController);

// Per-student attendance history
route.get("/attendance/:enrollmentId/history", adminTeacherWithEnrollmentId, getAttendanceHistoryController);

export default route;
