import {Router, type RequestHandler} from "express";

import {createUserController, getAllUsersController, getUserByIdController, updateUserByUserIdController} from "../controller/users.js";

// Role-based access control
import allowedRoles from "../middleware/allowedRoles.js";
import { ValidateToken } from "../middleware/validateToken.js";
import { ROLES } from "../constant/users.js";

const route: Router = Router();

// Writes + user reads are admin-only; :id routes carry a numeric param
const adminOnly: RequestHandler[] = [ValidateToken, allowedRoles([ROLES.ADMIN])];
const adminOnlyWithId: RequestHandler<{id: number}>[] = [ValidateToken, allowedRoles([ROLES.ADMIN])];
const updateUsersWithId: RequestHandler<{id: number}>[] = [ValidateToken, allowedRoles([ROLES.ADMIN, ROLES.STUDENT, ROLES.TEACHER])];

// ==================== ADMIN ONLY ====================
route.post('/users', adminOnly, createUserController);
route.get('/users', adminOnly, getAllUsersController);
route.get('/users/:id', adminOnlyWithId, getUserByIdController);

// ==================== ADMIN + USER ====================
route.put('/users/:id', updateUsersWithId, updateUserByUserIdController);

export default route;