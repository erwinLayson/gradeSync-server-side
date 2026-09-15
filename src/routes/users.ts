import {Router, type RequestHandler} from "express";

import {createUserController, getAllUsersController, getUserByIdController, updateUserByUserIdController, updateUserStatusController, updateUserRoleController, resetUserPasswordController} from "../controller/users.js";

// Role-based access control
import allowedRoles from "../middleware/allowedRoles.js";
import { ValidateToken } from "../middleware/validateToken.js";
import { ROLES } from "../constant/users.js";

const route: Router = Router();

// Writes + user reads are admin-only; :id routes carry a numeric param
const adminOnly: RequestHandler[] = [ValidateToken, allowedRoles([ROLES.ADMIN])];
const adminOnlyWithId: RequestHandler<{id: number}>[] = [ValidateToken, allowedRoles([ROLES.ADMIN])];
// Own-credential updates: any role may update its OWN account (developer
// included — settings page email/password form).
const updateUsersWithId: RequestHandler<{id: number}>[] = [ValidateToken, allowedRoles([ROLES.ADMIN, ROLES.STUDENT, ROLES.TEACHER, ROLES.DEVELOPER])];

// Reads are admin + developer (developer manages login accounts — docs/developer-users-plan.md)
const adminOrDev: RequestHandler[] = [ValidateToken, allowedRoles([ROLES.ADMIN, ROLES.DEVELOPER])];
const adminOrDevWithId: RequestHandler<{id: number}>[] = [ValidateToken, allowedRoles([ROLES.ADMIN, ROLES.DEVELOPER])];
// Account-management actions are developer-only (admin keeps academic entities)
const devOnlyWithId: RequestHandler<{id: number}>[] = [ValidateToken, allowedRoles([ROLES.DEVELOPER])];

// ==================== ADMIN ONLY ====================
route.post('/users', adminOnly, createUserController);
route.get('/users', adminOrDev, getAllUsersController);
route.get('/users/:id', adminOrDevWithId, getUserByIdController);

// ==================== ADMIN + USER ====================
route.put('/users/:id', updateUsersWithId, updateUserByUserIdController);

// ==================== DEVELOPER ONLY — account management ====================
route.patch('/users/:id/status', devOnlyWithId, updateUserStatusController);
route.patch('/users/:id/role', devOnlyWithId, updateUserRoleController);
route.post('/users/:id/reset-password', devOnlyWithId, resetUserPasswordController);

export default route;