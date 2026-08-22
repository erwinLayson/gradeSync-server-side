import { Router, type RequestHandler } from "express";

import { 
    CreateTeacherController, 
    getAllTeachersController, 
    getTeacherByUserIdController,
    getTeacherByIdController, 
    UpdateTeacherController, 
    DeleteTeacherController,
    getTeacherSubjectDetailsByIdController } from "../controller/teachers.js";

// Role-based access control
import allowedRoles from "../middleware/allowedRoles.js";
import { ValidateToken } from "../middleware/validateToken.js";
import { ROLES } from "../constant/users.js";

const router: Router = Router();

const adminOnly: RequestHandler[] = [ValidateToken, allowedRoles([ROLES.ADMIN])];
const adminTeacher: RequestHandler[] = [ValidateToken, allowedRoles([ROLES.ADMIN, ROLES.TEACHER])];
const adminTeacherWithId: RequestHandler<{id: number}>[] = [ValidateToken, allowedRoles([ROLES.ADMIN, ROLES.TEACHER])];
const adminTeacherWithUserId: RequestHandler<{userId: number}>[] = [ValidateToken, allowedRoles([ROLES.ADMIN, ROLES.TEACHER])];
const adminTeacherWithTeacherId: RequestHandler<{teacherId: number}>[] = [ValidateToken, allowedRoles([ROLES.ADMIN, ROLES.TEACHER])];
const adminOnlyWithId: RequestHandler<{id: number}>[] = [ValidateToken, allowedRoles([ROLES.ADMIN])];

// ==================== ADMIN ONLY ====================
router.post("/teachers", adminOnly, CreateTeacherController);
router.patch("/teachers/:id", adminTeacherWithId, UpdateTeacherController);
router.delete("/teachers/:id", adminOnlyWithId, DeleteTeacherController);

// ==================== ADMIN + TEACHER ====================
router.get("/teachers", adminTeacher, getAllTeachersController);

// ========== Get teacher by the linked user account ID ================
router.get("/teachers/by-user/:userId", adminTeacherWithUserId, getTeacherByUserIdController);
router.get("/teachers/:id", adminTeacherWithId, getTeacherByIdController);

// ========== Get teachers subject details by teachers ID route ================
router.get("/teachers/:teacherId/subjects", adminTeacherWithTeacherId, getTeacherSubjectDetailsByIdController)
export default router;
