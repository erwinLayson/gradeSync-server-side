import {getDBPoolConnection} from "../config/database.js";
import { ForbiddenError, UnauthorizedError } from "../middleware/errors.js";
import bcrypt from "bcrypt";

import UserModel from '../model/users.js';
import FeaturesModel from '../model/features.js';
import FacultyModel from '../model/faculties.js';

import { ROLES } from "../constant/users.js";
import type{AuthenticatedUser} from "../constant/auth.js"
import type{LoginCredentials} from "../constant/auth.js"
import type{FacultyRole} from "../constant/faculties.js"


export async function LoginUserService(loginCredentials: LoginCredentials): Promise<AuthenticatedUser> {
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

        // Faculty accounts (teacher + register) share users.role = "teacher";
        // resolve the authoritative faculties.role so the session can tell the
        // two workspaces apart without a second lookup. See the faculty-role
        // plan and middleware/allowedFacultyRoles.ts.
        let facultyRole: FacultyRole | undefined;
        if (user.role === ROLES.TEACHER) {
            const facultyModel = new FacultyModel(connection);
            const faculty = await facultyModel.getFacultyByUserId(user.id);
            facultyRole = faculty?.role;
        }

        return { id: user.id, email: user.email, role: user.role, facultyRole };
    }finally {
        connection.release();
    }
}