import type{Response, Request, NextFunction} from "express";

// Data Types
import type{CreateUserProps, UpdateUserCredentialsProps} from "../constant/users.js"
import { ROLES } from "../constant/users.js";

// Helper Functions
import NormalizedData from "../helper/normalizedData.js";
import {SuccessResponse} from "../helper/response.js";
import Validate from "../helper/validate.js";
import { BadRequestError, ForbiddenError } from "../middleware/errors.js";

// Service Functions
import {
    createUserService,
    getAllUserService,
    getUserByIdService,
    updateUserByUserIdService
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
export async function getAllUsersController(_req: Request, res: Response) {
    try {
        const result = await getAllUserService();
        res.status(200).json(
            SuccessResponse({
                message: "Transaction Successfull",
                data: result
            })
        )
    }catch(err) {

    }
}

// =============== get user by ID controller ================
export async function getUserByIdController(req: Request<{id: number}>, res: Response) {
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