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

// SF10 / Form-137 is a register-staff responsibility. After the migration there is
// no user-level `register` role, so this endpoint is authorized through the
// authenticated user's verified faculty record instead of through `users.role`.
// Admins keep access; a register faculty member reaches the controller through the
// verified faculty path; everyone else is refused.
const adminRegisterWithId: RequestHandler<{id: string}>[] = [
    ValidateToken,
    allowedRoles([ROLES.ADMIN, ROLES.TEACHER]),
    allowedFacultyRoles([FACULTY_ROLES.REGISTER], { allowAdmin: true }),
];

// ==================== ADVISER (faculty) ====================
// The adviser's own advised class (adviser ownership is checked in the service).
router.get("/student-records/my-class", facultyOnly, getMyClassRecordsController);

// ==================== ADMIN + TEACHER ====================
// Adviser-scope checks live in the service (faculties must be the class adviser).
router.get("/student-records/class/:classId", adminFaculty, getClassRecordsController);
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

// ==================== ADMIN ONLY ====================
router.get("/student-records/summary", adminOnly, getSubmissionSummaryController);

// ==================== PDF ====================
// SF10 / Form-137 student record. Admin + Register share this endpoint per
// docs/register-role-implementation-plan.md §6.3 — the Register role prints
// SF10 for registration purposes. The template and PDF pipeline are unchanged.
router.get("/student-records/:id/pdf", adminRegisterWithId, studentRecordController);

export default router;
