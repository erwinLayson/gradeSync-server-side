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

const router: Router = Router();

const adminOnly: RequestHandler[] = [ValidateToken, allowedRoles([ROLES.ADMIN])];
const adminTeacher: RequestHandler[] = [ValidateToken, allowedRoles([ROLES.ADMIN, ROLES.TEACHER])];
const teacherOnly: RequestHandler[] = [ValidateToken, allowedRoles([ROLES.TEACHER])];
const adminOnlyWithId: RequestHandler<{id: string}>[] = [ValidateToken, allowedRoles([ROLES.ADMIN])];
const adminRegisterWithId: RequestHandler<{id: string}>[] = [ValidateToken, allowedRoles([ROLES.ADMIN, ROLES.REGISTER])];

// ==================== ADVISER (teacher) ====================
// The adviser's own advised class (adviser ownership is checked in the service).
router.get("/student-records/my-class", teacherOnly, getMyClassRecordsController);

// ==================== ADMIN + TEACHER ====================
// Adviser-scope checks live in the service (teachers must be the class adviser).
router.get("/student-records/class/:classId", adminTeacher, getClassRecordsController);
router.post(
    "/student-records/class/:classId/students/:enrollmentId/quarter/:quarter/submit",
    adminTeacher,
    submitStudentRecordController
);
router.post(
    "/student-records/class/:classId/quarter/:quarter/submit-all",
    adminTeacher,
    submitAllStudentRecordsController
);
router.post(
    "/student-records/class/:classId/students/:enrollmentId/quarter/:quarter/reopen",
    adminTeacher,
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
