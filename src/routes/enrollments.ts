import { Router, type RequestHandler } from "express";

import { createEnrollmentController, bulkRemoveEnrollmentsController, clearAllFromClassController, clearAllClassroomsController, countActiveEnrollmentsController } from "../controller/enrollments.js";

// Role-based access control
import allowedRoles from "../middleware/allowedRoles.js";
import { ValidateToken } from "../middleware/validateToken.js";
import { ROLES } from "../constant/users.js";
import { FACULTY_ROLES } from "../constant/faculties.js";
import { allowedFacultyRoles } from "../middleware/allowedFacultyRoles.js";

const route: Router = Router();

const adminOnly: RequestHandler[] = [ValidateToken, allowedRoles([ROLES.ADMIN])];

// Enrollment is a register-staff responsibility (docs/register-role-implementation-plan.md
// §4.2). After the migration there is no user-level `register` role, so the register
// enrollment path is authorized through the authenticated user's verified faculty
// record instead of through `users.role`. Admins keep access; a register faculty
// member reaches the controller through the verified faculty path; everyone else is
// refused.
const adminRegister: RequestHandler[] = [
    ValidateToken,
    allowedRoles([ROLES.ADMIN, ROLES.TEACHER]),
    allowedFacultyRoles([FACULTY_ROLES.REGISTER], { allowAdmin: true }),
];

// ==================== ADMIN + REGISTER ====================

// Enrollments Routes
route.post("/enrollments", adminRegister, createEnrollmentController);

// ==================== ADMIN ONLY ====================
route.get("/enrollments/active-count", adminOnly, countActiveEnrollmentsController);
route.delete("/classrooms/:classId/enrollments", adminOnly, bulkRemoveEnrollmentsController);
route.delete("/classrooms/:classId/enrollments/clear", adminOnly, clearAllFromClassController);
route.delete("/enrollments/clear-all", adminOnly, clearAllClassroomsController);

export default route;
