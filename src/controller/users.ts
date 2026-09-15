import type{Response, Request, NextFunction} from "express";

// Data Types
import type{CreateUserProps, UpdateUserCredentialsProps} from "../constant/users.js"
import { ROLES, type UserRoles } from "../constant/users.js";

// Helper Functions
import NormalizedData from "../helper/normalizedData.js";
import {SuccessResponse} from "../helper/response.js";
import Validate from "../helper/validate.js";
import { BadRequestError, ForbiddenError, NotFoundError } from "../middleware/errors.js";

// Service Functions
import {
    createUserService,
    getAllUserService,
    getUserByIdService,
    updateUserByUserIdService,
    updateUserStatusService,
    updateUserRoleService,
    resetUserPasswordService
} from "../service/users.js";


// =================== create user controller ===================
export async function createUserController(req: Request<{}, {}, CreateUserProps>, res: Response, next: NextFunction) {
    try {
        const {email, password, role} = req.body;
        const user = {
            email: NormalizedData(email),
            password: NormalizedData(password),
            role: NormalizedData(role)
        };

        // Validate User data
        Validate(user);

        await createUserService(user)
        res.status(201).json(
            SuccessResponse(
                {
                    message: "User created successfully"
                }
            )
        );
    }catch(err) {
        next(err);
    }
}
// ================= get all users controller =================
export async function getAllUsersController(_req: Request, res: Response, next: NextFunction) {
    try {
        const result = await getAllUserService();
        res.status(200).json(
            SuccessResponse({
                message: "Transaction Successfull",
                data: result
            })
        )
    }catch(err) {
        next(err);
    }
}

// =============== get user by ID controller ================
export async function getUserByIdController(req: Request<{id: number}>, res: Response, next: NextFunction) {
    const {id } = req.params;

    if(!id) {
        throw new BadRequestError(`Invalid ID: ${id}`);
    }

    try {
        const result = await getUserByIdService(id);
        res.status(200).json(
            SuccessResponse({
                message: "Transaction Successfull",
                data: result
            })
        )
    }catch(err) {
        next(err);
    }
}

// ================ update user by ID controller ================
// Any logged-in user may update their OWN credentials; admins may also update
// other users. Anything else is forbidden.
export async function updateUserByUserIdController(req: Request<{id: number}, {}, UpdateUserCredentialsProps>, res: Response, next: NextFunction) {
    const {id} = req.params;
    const newUserCredentials = req.body;

    const targetUserId = Number(id);
    if (!id || Number.isNaN(targetUserId)) {
        throw new BadRequestError(`Invalid ID: ${id}`);
    }

    const isOwnAccount = req.user?.id === targetUserId;
    const isAdmin = req.user?.role === ROLES.ADMIN;
    if (!isOwnAccount && !isAdmin) {
        throw new ForbiddenError("You can only update your own account");
    }

    try {
        const updatedUser = await updateUserByUserIdService(targetUserId, newUserCredentials, isOwnAccount);
        res.status(200).json(
            SuccessResponse({
                message: "User updated successfully",
                data: updatedUser
            })
        )
    }catch(err) {
        next(err);
    }

}

// =================== developer account management controllers ===================
// docs/developer-users-plan.md Phase 1. Every route is gated developer-only
// in routes/users.ts; these controllers only parse/validate input and pass
// the ACTING user's id (req.user.id) into the services, which enforce the
// §3.2 guardrails server-side.

// =============== update account status controller ================
// PATCH /users/:id/status  { status: "active" | "inactive" }
export async function updateUserStatusController(req: Request<{id: number}, {}, {status: string}>, res: Response, next: NextFunction) {
    const {id} = req.params;
    const targetUserId = Number(id);
    if (!id || Number.isNaN(targetUserId)) {
        throw new BadRequestError(`Invalid ID: ${id}`);
    }

    const {status} = req.body;
    if (status !== "active" && status !== "inactive") {
        throw new BadRequestError('"status" must be "active" or "inactive"');
    }

    try {
        const updatedUser = await updateUserStatusService(targetUserId, status, req.user!.id);
        res.status(200).json(
            SuccessResponse({
                message: status === "inactive"
                    ? "User account deactivated"
                    : "User account activated",
                data: updatedUser
            })
        )
    }catch(err) {
        next(err);
    }
}

// =============== update account role controller ================
// PATCH /users/:id/role  { role: UserRoles }
export async function updateUserRoleController(req: Request<{id: number}, {}, {role: string}>, res: Response, next: NextFunction) {
    const {id} = req.params;
    const targetUserId = Number(id);
    if (!id || Number.isNaN(targetUserId)) {
        throw new BadRequestError(`Invalid ID: ${id}`);
    }

    const {role} = req.body;
    // Whitelist: no arbitrary strings reach the service/DB.
    const validRoles = Object.values(ROLES) as string[];
    if (!validRoles.includes(role)) {
        throw new BadRequestError(`"role" must be one of: ${validRoles.join(", ")}`);
    }

    try {
        const updatedUser = await updateUserRoleService(targetUserId, role as UserRoles, req.user!.id);
        res.status(200).json(
            SuccessResponse({
                message: "User role updated successfully",
                data: updatedUser
            })
        )
    }catch(err) {
        next(err);
    }
}

// =============== reset password controller ================
// POST /users/:id/reset-password  (no body) → { tempPassword }
export async function resetUserPasswordController(req: Request<{id: number}>, res: Response, next: NextFunction) {
    const {id} = req.params;
    const targetUserId = Number(id);
    if (!id || Number.isNaN(targetUserId)) {
        throw new BadRequestError(`Invalid ID: ${id}`);
    }

    try {
        const result = await resetUserPasswordService(targetUserId, req.user!.id);
        res.status(200).json(
            SuccessResponse({
                message: "Temporary password generated — share it securely; it is shown only once",
                data: result
            })
        )
    }catch(err) {
        next(err);
    }
}