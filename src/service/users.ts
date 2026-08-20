import bcrypt from "bcrypt";
import { PoolConnection } from "mysql2/promise";

import UserModel from "../model/users.js";
import { getDBPoolConnection } from "../config/database.js";

import { ConflictError, UnauthorizedError } from "../middleware/errors.js";

import type { CreateUserProps, UpdateUserCredentialsProps } from "../constant/users.js";

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