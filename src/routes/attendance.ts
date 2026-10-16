import { Router, type RequestHandler } from "express";

import {
    getAttendanceByClassSubjectAndDateController,
    getAttendanceHistoryController,
    getAttendanceRangeController,
    saveAttendanceController,
} from "../controller/attendance.js";

// Role-based access control
import allowedRoles from "../middleware/allowedRoles.js";
import { allowedFacultyRoles } from "../middleware/allowedFacultyRoles.js";
import { ValidateToken } from "../middleware/validateToken.js";
import { ROLES } from "../constant/users.js";
import { FACULTY_ROLES } from "../constant/faculties.js";

const route: Router = Router();

const adminFaculty: RequestHandler[] = [
    ValidateToken,
    allowedRoles([ROLES.ADMIN, ROLES.TEACHER]),
    allowedFacultyRoles([FACULTY_ROLES.TEACHER], { allowAdmin: true }),
];
const adminFacultyWithEnrollmentId: RequestHandler<{ enrollmentId: number }>[] = [
    ValidateToken,
    allowedRoles([ROLES.ADMIN, ROLES.TEACHER]),
    allowedFacultyRoles([FACULTY_ROLES.TEACHER], { allowAdmin: true }),
];

// ==================== ADMIN + TEACHER ====================

// Daily attendance recording (per class subject)
route.get("/attendance", adminFaculty, getAttendanceByClassSubjectAndDateController);
route.post("/attendance", adminFaculty, saveAttendanceController);

// Class-wide attendance matrix (students × dates) for the spreadsheet view.
// Registered before the parameterized history route so "/attendance/range" is
// never read as an enrollmentId.
route.get("/attendance/range", adminFaculty, getAttendanceRangeController);

// Per-student attendance history
route.get("/attendance/:enrollmentId/history", adminFacultyWithEnrollmentId, getAttendanceHistoryController);

export default route;
