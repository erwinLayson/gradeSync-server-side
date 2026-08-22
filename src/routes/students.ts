import { Router, type RequestHandler } from "express";

import {
    createStudentController, 
    getAllNotEnrolledStudentsController, 
    getAllStudentController, 
    getStudentByIdController,
    updateStudentController,
    deleteStudentController
 } from "../controller/students.js";import { getMyStudentProfileController,
    updateMyStudentDetailsController
} from "../controller/studentDetails.js";
import { getAcademicSettingsController } from "../controller/academicSettings.js";

import { getMyClassesController, getStudentProspectusController, getStudentClassAttendanceController, getStudentAcademicHistoryController } from "../controller/studentClasses.js";

// Role-based access control
import allowedRoles from "../middleware/allowedRoles.js";
import { ValidateToken } from "../middleware/validateToken.js";
import { ROLES } from "../constant/users.js";

const route: Router = Router();

const adminOnly: RequestHandler[] = [ValidateToken, allowedRoles([ROLES.ADMIN])];
const adminOnlyWithId: RequestHandler<{id: string}>[] = [ValidateToken, allowedRoles([ROLES.ADMIN])];
const adminTeacher: RequestHandler[] = [ValidateToken, allowedRoles([ROLES.ADMIN, ROLES.TEACHER])];
const adminTeacherWithId: RequestHandler<{id: number}>[] = [ValidateToken, allowedRoles([ROLES.ADMIN, ROLES.TEACHER])];
const studentOnly: RequestHandler[] = [ValidateToken, allowedRoles([ROLES.STUDENT])];

// ==================== STUDENT ONLY (self-service profile) ====================
// Registered BEFORE the parameterized /students/:id routes so that
// "/students/details" is not swallowed by ":id" (Express matches in order).
route.get("/students/details", studentOnly, getMyStudentProfileController)
route.patch("/students/details", studentOnly, updateMyStudentDetailsController)
route.get("/students/classes", studentOnly, getMyClassesController)
route.get("/students/prospectus", studentOnly, getStudentProspectusController)
route.get("/students/attendance", studentOnly, getStudentClassAttendanceController)
route.get("/students/current-quarter", studentOnly, getAcademicSettingsController)

// ==================== ADMIN ONLY ====================
route.post("/students", adminOnly, createStudentController)
route.patch("/students/:id", adminOnlyWithId, updateStudentController)
route.delete("/students/:id", adminOnlyWithId, deleteStudentController)
route.get("/students/not-enrolled", adminOnly, getAllNotEnrolledStudentsController)

// ==================== ADMIN + TEACHER ====================
route.get("/students", adminTeacher, getAllStudentController)
route.get("/students/:id/students", adminTeacherWithId, getStudentByIdController)
route.get("/students/:id/academic-history", adminTeacherWithId, getStudentAcademicHistoryController)

export default route