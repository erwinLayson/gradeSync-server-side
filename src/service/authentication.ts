import {getDBPoolConnection} from "../config/database.js";
import { ForbiddenError, UnauthorizedError } from "../middleware/errors.js";
import bcrypt from "bcrypt";

import UserModel from '../model/users.js';
import FeaturesModel from '../model/features.js';

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

        // Role login switches (docs/role-login-switches-plan.md): while the
        // login_<role> feature flag is disabled, that whole role is refused
        // at login. Fail-open: a missing row never locks anyone out, and
        // login_developer does not exist, so developers are never gated.
        const featureModel = new FeaturesModel(connection);
        const loginSwitch = await featureModel.getByKey(`login_${user.role}`);
        if (loginSwitch && !loginSwitch.enabled) {
            throw new ForbiddenError(`Logins for ${user.role} accounts are currently disabled. Contact the system developer.`);
        }

        return user;
    }finally {
        connection.release();
    }
}