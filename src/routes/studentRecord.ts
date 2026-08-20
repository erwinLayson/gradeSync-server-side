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
// Teachers are scoped in the service to students in their advised class.
router.get("/student-records/:id/pdf", adminOnlyWithId, studentRecordController);

export default router;
