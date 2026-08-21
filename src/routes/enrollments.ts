import { Router, type RequestHandler } from "express";

import { createEnrollmentController, bulkRemoveEnrollmentsController, clearAllFromClassController, clearAllClassroomsController, countActiveEnrollmentsController } from "../controller/enrollments.js";

// Role-based access control
import allowedRoles from "../middleware/allowedRoles.js";
import { ValidateToken } from "../middleware/validateToken.js";
import { ROLES } from "../constant/users.js";

const route: Router = Router();

const adminOnly: RequestHandler[] = [ValidateToken, allowedRoles([ROLES.ADMIN])];

// ==================== ADMIN ONLY ====================

// Enrollments Routes
route.post("/enrollments", adminOnly, createEnrollmentController);
route.get("/enrollments/active-count", adminOnly, countActiveEnrollmentsController);
route.delete("/classrooms/:classId/enrollments", adminOnly, bulkRemoveEnrollmentsController);
route.delete("/classrooms/:classId/enrollments/clear", adminOnly, clearAllFromClassController);
route.delete("/enrollments/clear-all", adminOnly, clearAllClassroomsController);

export default route;
