import { Router, type RequestHandler } from "express";

import {
    getClassRecordsController,
    getMyClassRecordsController,
    getSubmissionSummaryController,
    reopenStudentRecordController,
    studentRecordController,
    submitAllStudentRecordsController,
    submitStudentRecordController
} from "../controller/studentRecord.js";

// Role-based access control
import allowedRoles from "../middleware/allowedRoles.js";
import { ValidateToken } from "../middleware/validateToken.js";
import { ROLES } from "../constant/users.js";
import { FACULTY_ROLES } from "../constant/faculties.js";
import { allowedFacultyRoles } from "../middleware/allowedFacultyRoles.js";

const router: Router = Router();

const adminOnly: RequestHandler[] = [ValidateToken, allowedRoles([ROLES.ADMIN])];
// Teaching-capability routes: the user-role guard says "this is a faculty
// account" (users.role = "teacher"); the faculty guard makes the teaching
// requirement explicit, so a register faculty member is refused at the route
// layer as well as in the services.
const adminFaculty: RequestHandler[] = [
    ValidateToken,
    allowedRoles([ROLES.ADMIN, ROLES.TEACHER]),
    allowedFacultyRoles([FACULTY_ROLES.TEACHER], { allowAdmin: true }),
];
const facultyOnly: RequestHandler[] = [
    ValidateToken,
    allowedRoles([ROLES.ADMIN, ROLES.TEACHER]),
    allowedFacultyRoles([FACULTY_ROLES.TEACHER], { allowAdmin: true }),
];

// SF10 / Form-137 and Submission Tracker are register-staff responsibilities. After the migration there is
// no user-level `register` role, so these endpoints are authorized through the
// authenticated user's verified faculty record instead of through `users.role`.
// Admins keep access; a register faculty member reaches the controller through the
// verified faculty path; everyone else is refused.
const adminRegister: RequestHandler[] = [
    ValidateToken,
    allowedRoles([ROLES.ADMIN, ROLES.TEACHER]),
    allowedFacultyRoles([FACULTY_ROLES.REGISTER], { allowAdmin: true }),
];
const adminRegisterWithId: RequestHandler<{id: string}>[] = [
    ValidateToken,
    allowedRoles([ROLES.ADMIN, ROLES.TEACHER]),
    allowedFacultyRoles([FACULTY_ROLES.REGISTER], { allowAdmin: true }),
];

// Class records can be viewed by class advisers, register staff (via Submission Tracker drill-down), and admin.
const classRecordsReaders: RequestHandler[] = [
    ValidateToken,
    allowedRoles([ROLES.ADMIN, ROLES.TEACHER]),
    allowedFacultyRoles([FACULTY_ROLES.TEACHER, FACULTY_ROLES.REGISTER], { allowAdmin: true }),
];

// ==================== ADVISER (faculty) ====================
// The adviser's own advised class (adviser ownership is checked in the service).
router.get("/student-records/my-class", facultyOnly, getMyClassRecordsController);

// ==================== ADMIN + TEACHER + REGISTER ====================
// Adviser-scope checks live in the service (teachers must be the class adviser; admin and register inspect all classes).
router.get("/student-records/class/:classId", classRecordsReaders, getClassRecordsController);
router.post(
    "/student-records/class/:classId/students/:enrollmentId/quarter/:quarter/submit",
    adminFaculty,
    submitStudentRecordController
);
router.post(
    "/student-records/class/:classId/quarter/:quarter/submit-all",
    adminFaculty,
    submitAllStudentRecordsController
);
router.post(
    "/student-records/class/:classId/students/:enrollmentId/quarter/:quarter/reopen",
    adminFaculty,
    reopenStudentRecordController
);

// ==================== ADMIN + REGISTER ====================
router.get("/student-records/summary", adminRegister, getSubmissionSummaryController);

// ==================== PDF ====================
// SF10 / Form-137 student record. Admin + Register share this endpoint per
// docs/register-role-implementation-plan.md §6.3 — the Register role prints
// SF10 for registration purposes. The template and PDF pipeline are unchanged.
router.get("/student-records/:id/pdf", adminRegisterWithId, studentRecordController);

export default router;
