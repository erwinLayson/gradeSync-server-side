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

import { getPastSubmittedGradesController } from "../controller/pastGrades.js";

// Role-based access control
import allowedRoles from "../middleware/allowedRoles.js";
import { allowedFacultyRoles } from "../middleware/allowedFacultyRoles.js";
import { ValidateToken } from "../middleware/validateToken.js";
import { ROLES } from "../constant/users.js";
import { FACULTY_ROLES } from "../constant/faculties.js";

const route: Router = Router();

const adminOnlyWithId: RequestHandler<{id: string}>[] = [ValidateToken, allowedRoles([ROLES.ADMIN])];
const studentOnly: RequestHandler[] = [ValidateToken, allowedRoles([ROLES.STUDENT])];

// ==================== REGISTER (registration/enrollment staff) ====================
// docs/register-role-implementation-plan.md: Register owns the registration
// workflow — it manages the student registry (list, create, edit, delete),
// reads student detail/academic history during enrollment, and enrols students.
// The past-submitted-grades view stays Admin-only.
//
// After the migration there is no user-level `register` role. Register-staff
// access is therefore authorized through the authenticated user's verified
// faculty record (`faculties.role === "register"`), via the combined guard below.
// Admins still pass through the role guard and skip the faculty-guard allow-list;
// register faculty members pass through both guards; teacher faculty members and
// accounts without a linked faculty record are refused.
const adminRegister: RequestHandler[] = [
    ValidateToken,
    allowedRoles([ROLES.ADMIN, ROLES.TEACHER]),
    allowedFacultyRoles([FACULTY_ROLES.REGISTER], { allowAdmin: true }),
];
// Update/delete controllers are typed with a string `:id` param (matching the
// original adminOnlyWithId group), so this guard keeps the same param type.
const adminRegisterWithId: RequestHandler<{id: string}>[] = [
    ValidateToken,
    allowedRoles([ROLES.ADMIN, ROLES.TEACHER]),
    allowedFacultyRoles([FACULTY_ROLES.REGISTER], { allowAdmin: true }),
];

// Read-side shared view: admins and teaching faculty may read the student list and
// detail/academic-history during enrollment, and register staff may too. This is
// the combined guard for the teaching + register read surface.
const adminFacultyRegister: RequestHandler[] = [
    ValidateToken,
    allowedRoles([ROLES.ADMIN, ROLES.TEACHER]),
    allowedFacultyRoles([FACULTY_ROLES.TEACHER, FACULTY_ROLES.REGISTER], { allowAdmin: true }),
];
const adminFacultyRegisterWithId: RequestHandler<{id: number}>[] = [
    ValidateToken,
    allowedRoles([ROLES.ADMIN, ROLES.TEACHER]),
    allowedFacultyRoles([FACULTY_ROLES.TEACHER, FACULTY_ROLES.REGISTER], { allowAdmin: true }),
];

// ==================== STUDENT ONLY (self-service profile) ====================
// Registered BEFORE the parameterized /students/:id routes so that
// "/students/details" is not swallowed by ":id" (Express matches in order).
route.get("/students/details", studentOnly, getMyStudentProfileController)
route.patch("/students/details", studentOnly, updateMyStudentDetailsController)
route.get("/students/classes", studentOnly, getMyClassesController)
route.get("/students/prospectus", studentOnly, getStudentProspectusController)
route.get("/students/attendance", studentOnly, getStudentClassAttendanceController)
route.get("/students/current-quarter", studentOnly, getAcademicSettingsController)

// ==================== ADMIN + REGISTER ====================
// Register owns the student registry: it creates the student + login account
// (role locked to `student` inside createStudentService), edits records, and
// soft-deletes them.
route.post("/students", adminRegister, createStudentController)
route.patch("/students/:id", adminRegisterWithId, updateStudentController)
route.delete("/students/:id", adminRegisterWithId, deleteStudentController)
// Register searches the not-yet-enrolled candidate pool while enrolling.
route.get("/students/not-enrolled", adminRegister, getAllNotEnrolledStudentsController)

// ==================== ADMIN + TEACHER + REGISTER ====================
route.get("/students", adminFacultyRegister, getAllStudentController)
route.get("/students/:id/students", adminFacultyRegisterWithId, getStudentByIdController)
route.get("/students/:id/academic-history", adminFacultyRegisterWithId, getStudentAcademicHistoryController)

// Admin and Register curated view of a candidate's already-submitted past grades during enrollment.
route.get("/students/:id/past-submitted-grades", adminRegisterWithId, getPastSubmittedGradesController)

export default route