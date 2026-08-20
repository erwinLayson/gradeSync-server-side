import {getDBPoolConnection} from "../config/database.js";
import { UnauthorizedError } from "../middleware/errors.js";
import bcrypt from "bcrypt";

import UserModel from '../model/users.js';

import type{User} from "../constant/users.js"
import type{LoginCredentials} from "../constant/auth.js"


export async function LoginUserService(loginCredentials: LoginCredentials): Promise<User> {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        const userModel = new UserModel(connection);
        const user = await userModel.getUserByEmail(loginCredentials.email);
        if (!user) {
            throw new UnauthorizedError("Invalid email or password");
        }

        const isPasswordValid = await bcrypt.compare(loginCredentials.password, user.password);
        if (!isPasswordValid) {
            throw new UnauthorizedError("Invalid email or password");
        };

        // Deactivated accounts (e.g. soft-deleted students) cannot sign in.
        if (user.status === "inactive") {
            throw new UnauthorizedError("Your account has been deactivated. Contact the administrator.");
        }

        return user;
    }finally {
        connection.release();
    }
}