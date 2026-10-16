import { Router, type RequestHandler } from "express";

import { 
    CreateFacultyController, 
    getAllFacultiesController, 
    getFacultyByUserIdController,
    getFacultyByIdController, 
    UpdateFacultyController, 
    DeleteFacultyController,
    getFacultySubjectDetailsByIdController } from "../controller/faculties.js";

// Role-based access control
import allowedRoles from "../middleware/allowedRoles.js";
import { allowedFacultyRoles } from "../middleware/allowedFacultyRoles.js";
import { ValidateToken } from "../middleware/validateToken.js";
import { ROLES } from "../constant/users.js";
import { FACULTY_ROLES } from "../constant/faculties.js";

const router: Router = Router();

const adminOnly: RequestHandler[] = [ValidateToken, allowedRoles([ROLES.ADMIN])];
// Faculty directory/detail routes are a teaching surface: admins pass, teacher
// faculty pass, register faculty are refused.
const adminFaculty: RequestHandler[] = [ValidateToken, allowedRoles([ROLES.ADMIN, ROLES.TEACHER]), allowedFacultyRoles([FACULTY_ROLES.TEACHER], { allowAdmin: true })];
const adminFacultyWithId: RequestHandler<{id: number}>[] = [ValidateToken, allowedRoles([ROLES.ADMIN, ROLES.TEACHER]), allowedFacultyRoles([FACULTY_ROLES.TEACHER], { allowAdmin: true })];
// Self-resolution route: register staff MUST reach this to resolve their
// faculties.role on navigation, so no faculty-role narrowing is applied here.
const adminFacultyWithUserId: RequestHandler<{userId: number}>[] = [ValidateToken, allowedRoles([ROLES.ADMIN, ROLES.TEACHER])];
const adminFacultyWithFacultyId: RequestHandler<{facultyId: number}>[] = [ValidateToken, allowedRoles([ROLES.ADMIN, ROLES.TEACHER]), allowedFacultyRoles([FACULTY_ROLES.TEACHER], { allowAdmin: true })];
const adminOnlyWithId: RequestHandler<{id: number}>[] = [ValidateToken, allowedRoles([ROLES.ADMIN])];

// ==================== ADMIN ONLY ====================
router.post("/faculties", adminOnly, CreateFacultyController);
router.patch("/faculties/:id", adminFacultyWithId, UpdateFacultyController);
router.delete("/faculties/:id", adminOnlyWithId, DeleteFacultyController);

// ==================== ADMIN + TEACHER ====================
router.get("/faculties", adminFaculty, getAllFacultiesController);

// ========== Get faculty by the linked user account ID ================
router.get("/faculties/by-user/:userId", adminFacultyWithUserId, getFacultyByUserIdController);
router.get("/faculties/:id", adminFacultyWithId, getFacultyByIdController);

// ========== Get faculties subject details by faculties ID route ================
router.get("/faculties/:facultyId/subjects", adminFacultyWithFacultyId, getFacultySubjectDetailsByIdController)
export default router;
