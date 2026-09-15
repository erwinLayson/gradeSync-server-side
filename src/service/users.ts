import bcrypt from "bcrypt";
import { PoolConnection } from "mysql2/promise";

import UserModel from "../model/users.js";
import { getDBPoolConnection } from "../config/database.js";

import { BadRequestError, ConflictError, ForbiddenError, NotFoundError, UnauthorizedError } from "../middleware/errors.js";
import { ROLES, type CreateUserProps, type UpdateUserCredentialsProps, type UserRoles } from "../constant/users.js";

export async function createUserService(user: CreateUserProps, existingConnection?: PoolConnection): Promise<number> {
    const pool = getDBPoolConnection();
    const connection = existingConnection || await pool.getConnection();
    const ownConnection = !existingConnection; // Check if the connection was provided or created here

    try {
        const userModel = new UserModel(connection);

        const userExist = await userModel.getUserByEmail(user.email);

        if(userExist) {
            throw new ConflictError(`User email already exists`)
        }
        console.log("Checking if user exists:", userExist);
        const hashedPassword = await bcrypt.hash(user.password, 10);
        const userId = await userModel.createUser({...user, password: hashedPassword});
        
        return userId;
    }finally {
        if (ownConnection) {
            connection.release();
        }
    }
}

export async function getAllUserService() {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();

    try {
        const userModel = new UserModel(connection);
        const users = await userModel.getAllUsers();
        return users;
    }finally {
        connection.release();
    }
}

export async function getUserByIdService(id: number) {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();

    try {
        const userModel = new UserModel(connection);
        const user = await userModel.getUserById(id);
        return user;
    }finally {
        connection.release();
    }
}

// ================ update user credentials service ================
// A user changing their OWN password must supply the current password
// (isOwnAccount = true), which is verified before the new one is applied.
// Admins acting on another user (and internal flows that sync a linked
// user's email when a teacher/student record changes) pass isOwnAccount = false
// and skip that check.
export async function updateUserByUserIdService(userId: number, newUserCredentials: UpdateUserCredentialsProps, isOwnAccount = false, existingConnection?: PoolConnection) {
    const pool = getDBPoolConnection();
    const connection = existingConnection || await pool.getConnection();
    const ownConnection = !existingConnection;

    try {
        const userModel = new UserModel(connection);
        const userAuth = await userModel.getUserAuthById(userId);

        if(!userAuth) {
            throw new ConflictError(`User with ID ${userId} does not exist`);
        }

        const { currentPassword, ...fieldsToUpdate } = newUserCredentials;

        // Email uniqueness (app-level: users.email has no DB unique constraint).
        if (fieldsToUpdate.email && fieldsToUpdate.email !== userAuth.email) {
            // Format guard — this endpoint is shared by all roles and the
            // email is the login identity, so reject malformed values here.
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fieldsToUpdate.email)) {
                throw new BadRequestError("Invalid email format");
            }

            // Own-account email change requires the current password, mirroring
            // the password rule — the email IS the login identity, so whoever
            // knows the current password can retake the account if it was left
            // unlocked. Admins acting on others keep the exemption.
            if (isOwnAccount) {
                const isCurrentPasswordValid = await bcrypt.compare(currentPassword ?? "", userAuth.password);
                if (!isCurrentPasswordValid) {
                    throw new UnauthorizedError("Current password is incorrect");
                }
            }

            const emailExists = await userModel.getUserByEmail(fieldsToUpdate.email);
            if (emailExists && emailExists.id !== userId) {
                throw new ConflictError("User email already exists");
            }
        }

        if (fieldsToUpdate.password) {
            if (isOwnAccount) {
                const isCurrentPasswordValid = await bcrypt.compare(currentPassword ?? "", userAuth.password);
                if (!isCurrentPasswordValid) {
                    throw new UnauthorizedError("Current password is incorrect");
                }
            }
            fieldsToUpdate.password = await bcrypt.hash(fieldsToUpdate.password, 10);
        }

        const updatedUser = await userModel.updateUserByUserId(userId, fieldsToUpdate);
        return updatedUser;
    }catch(err) {
        throw err;
    }finally {
        if(ownConnection) { 
            connection.release();
        }
    }
}

// ==================== developer account management ====================
// docs/developer-users-plan.md Phase 1. One action = one effect; every
// service enforces the §3.2 guardrails SERVER-SIDE (the frontend disabling
// buttons is UX only). All take the acting developer's id for self-checks.

// Resolve a target account or throw 404 (shared by all three actions).
async function requireUser(userId: number): Promise<NonNullable<Awaited<ReturnType<UserModel["getUserById"]>>>> {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        const userModel = new UserModel(connection);
        const user = await userModel.getUserById(userId);
        if (!user) {
            throw new NotFoundError(`User with ID ${userId} does not exist`, 404);
        }
        return user;
    } finally {
        connection.release();
    }
}

// Deactivate / reactivate a login account. Deactivation blocks login
// immediately (auth already rejects status='inactive') but keeps every
// academic link — reactivation restores everything.
export async function updateUserStatusService(
    targetUserId: number,
    status: "active" | "inactive",
    actingUserId: number,
) {
    const target = await requireUser(targetUserId);

    if (target.id === actingUserId && status === "inactive") {
        throw new ForbiddenError("You cannot deactivate your own account");
    }

    // Last-active-developer guardrail: a developer can never take the last
    // active developer account out of service.
    if (target.role === ROLES.DEVELOPER && status === "inactive") {
        const pool = getDBPoolConnection();
        const connection = await pool.getConnection();
        try {
            const userModel = new UserModel(connection);
            const activeDevelopers = await userModel.countActiveUsersByRole(ROLES.DEVELOPER);
            if (activeDevelopers <= 1) {
                throw new ForbiddenError("At least one active developer account must remain");
            }
        } finally {
            connection.release();
        }
    }

    const pool2 = getDBPoolConnection();
    const connection = await pool2.getConnection();
    try {
        const userModel = new UserModel(connection);
        await userModel.updateUserStatus(target.id, status);
        return await userModel.getUserById(target.id);
    } finally {
        connection.release();
    }
}

// Change an account's role (promotion/demotion). Role values were
// whitelist-validated in the controller; this service enforces the
// developer-account guardrails.
export async function updateUserRoleService(
    targetUserId: number,
    role: UserRoles,
    actingUserId: number,
) {
    const target = await requireUser(targetUserId);

    if (target.id === actingUserId && role !== ROLES.DEVELOPER) {
        throw new ForbiddenError("You cannot change your own role");
    }

    // Demoting the last active developer away from developer would leave the
    // platform without a platform manager.
    if (target.role === ROLES.DEVELOPER && role !== ROLES.DEVELOPER) {
        const pool = getDBPoolConnection();
        const connection = await pool.getConnection();
        try {
            const userModel = new UserModel(connection);
            const activeDevelopers = await userModel.countActiveUsersByRole(ROLES.DEVELOPER);
            if (activeDevelopers <= 1) {
                throw new ForbiddenError("At least one active developer account must remain");
            }
        } finally {
            connection.release();
        }
    }

    const pool2 = getDBPoolConnection();
    const connection = await pool2.getConnection();
    try {
        const userModel = new UserModel(connection);
        await userModel.updateUserRole(target.id, role);
        return await userModel.getUserById(target.id);
    } finally {
        connection.release();
    }
}

// Reset an account password to a generated temporary password. The value is
// returned ONCE so the developer can hand it over; only the bcrypt hash is
// stored. Refused on the developer's own account (use the Settings flow,
// which verifies the current password).
export async function resetUserPasswordService(targetUserId: number, actingUserId: number) {
    if (targetUserId === actingUserId) {
        throw new ForbiddenError("Use the Settings page to change your own password");
    }

    const target = await requireUser(targetUserId);

    // 12-char temp password: unambiguous set (no 0/O/1/l/I) so it survives
    // being read aloud or typed from paper.
    const alphabet = "23456789ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz";
    const tempPassword = Array.from(
        { length: 12 },
        () => alphabet[Math.floor(Math.random() * alphabet.length)],
    ).join("");

    const hashed = await bcrypt.hash(tempPassword, 10);

    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        const userModel = new UserModel(connection);
        // Reuses the credentials-update whitelist path (email/password only).
        await userModel.updateUserByUserId(target.id, { password: hashed });
        return { tempPassword };
    } finally {
        connection.release();
    }
}