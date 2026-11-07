import { Router, type RequestHandler } from "express";
import {
    submitAmendmentRequestController,
    getMyAmendmentRequestsController,
    getAllAmendmentRequestsController,
    getAmendmentRequestByIdController,
    approveAmendmentRequestController,
    rejectAmendmentRequestController,
    revokeAmendmentRequestController,
    getAmendmentAuditLogsController,
    submitSubjectRecordAmendmentController,
    applyUnifiedSubjectAmendmentController
} from "../controller/amendments.js";

// Role-based access control
import allowedRoles from "../middleware/allowedRoles.js";
import { ValidateToken } from "../middleware/validateToken.js";
import { ROLES } from "../constant/users.js";
import { FACULTY_ROLES } from "../constant/faculties.js";
import { allowedFacultyRoles } from "../middleware/allowedFacultyRoles.js";

const router: Router = Router();

// Teaching faculty (or Admin)
const facultyOnly: RequestHandler[] = [
    ValidateToken,
    allowedRoles([ROLES.ADMIN, ROLES.TEACHER]),
    allowedFacultyRoles([FACULTY_ROLES.TEACHER], { allowAdmin: true }),
];

// Register staff or Admin
const adminRegister: RequestHandler[] = [
    ValidateToken,
    allowedRoles([ROLES.ADMIN, ROLES.TEACHER]),
    allowedFacultyRoles([FACULTY_ROLES.REGISTER], { allowAdmin: true }),
];

const adminRegisterWithId: RequestHandler<{ id: string }>[] = [
    ValidateToken,
    allowedRoles([ROLES.ADMIN, ROLES.TEACHER]),
    allowedFacultyRoles([FACULTY_ROLES.REGISTER], { allowAdmin: true }),
];

// Any authenticated staff (teachers can read their own, register/admin can read all)
const staffOnly: RequestHandler[] = [
    ValidateToken,
    allowedRoles([ROLES.ADMIN, ROLES.TEACHER]),
    allowedFacultyRoles([FACULTY_ROLES.TEACHER, FACULTY_ROLES.REGISTER], { allowAdmin: true }),
];

const staffWithId: RequestHandler<{ id: string }>[] = [
    ValidateToken,
    allowedRoles([ROLES.ADMIN, ROLES.TEACHER]),
    allowedFacultyRoles([FACULTY_ROLES.TEACHER, FACULTY_ROLES.REGISTER], { allowAdmin: true }),
];

// ==================== TEACHER (Faculty) ====================
router.post("/amendments", facultyOnly, submitAmendmentRequestController);
router.post("/amendments/requests", facultyOnly, submitAmendmentRequestController);
router.post("/amendments/subject-record", facultyOnly, submitSubjectRecordAmendmentController);
router.post("/amendments/:permissionId/apply", facultyOnly, applyUnifiedSubjectAmendmentController);
router.get("/amendments/my-requests", facultyOnly, getMyAmendmentRequestsController);

// ==================== REGISTER & ADMIN REVIEW ====================
// staffOnly: getAmendmentRequestsService internally restricts teachers to their own requests, while admin/register view all.
router.get("/amendments/requests", staffOnly, getAllAmendmentRequestsController);
router.get("/amendments/requests/:id", staffWithId, getAmendmentRequestByIdController);
router.post("/amendments/requests/:id/approve", adminRegisterWithId, approveAmendmentRequestController);
router.post("/amendments/requests/:id/reject", adminRegisterWithId, rejectAmendmentRequestController);
router.post("/amendments/requests/:id/revoke", adminRegisterWithId, revokeAmendmentRequestController);

// ==================== AUDIT TRAIL ====================
router.get("/amendments/audit-logs", adminRegister, getAmendmentAuditLogsController);

export default router;

