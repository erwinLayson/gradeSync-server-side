import type { UserRoles } from "./users.js";
import type { FacultyRole } from "./faculties.js";

export interface LoginCredentials {
    email: string;
    password: string;
}

/**
 * The authenticated identity carried by a session (the login response body, the
 * signed JWT payload, and `req.user` after ValidateToken).
 *
 * For faculty accounts (users.role = "teacher") `facultyRole` is the
 * authoritative `faculties.role` resolved at login: both teacher and register
 * staff authenticate as users.role = "teacher", so this is the only value that
 * distinguishes the two workspaces. Undefined for every non-faculty role.
 */
export interface AuthenticatedUser {
    id: number;
    email: string;
    role: UserRoles;
    facultyRole?: FacultyRole | undefined;
}
