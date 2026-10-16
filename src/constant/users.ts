export interface User {
    id: number,
    email:string,
    role: UserRoles
}

export interface CreateUserProps {
    email:string,
    password: string,
    role: string
}

export interface UserResponseProps {
    id: number,
    email: string,
    role: UserRoles
    password: string
    status?: "active" | "inactive"
}

// Body accepted by PUT /users/:id. Users update their own email/password;
// currentPassword is required when a user changes their own password.
export interface UpdateUserCredentialsProps {
    email?: string;
    password?: string;
    currentPassword?: string;
}

export const ROLES = {
    ADMIN: "admin",
    TEACHER: "teacher",
    STUDENT: "student",
    DEVELOPER: "developer"
} as const;

/** Roles that may read academic settings (admin, faculty, register). */
export const ALLOWED_TO_READ_ACADEMIC_SETTINGS = [
    ROLES.ADMIN,
    ROLES.TEACHER,
    // Register is no longer a user role (see the task: "Move the Register Role
    // from Users to Faculties"). The academic-settings reader list is rewritten to
    // include a register faculty via the faculty-role check in the route/service
    // layer instead.
] as const;

/** Roles that may update academic settings (admin only). */
export const ALLOWED_TO_EDIT_ACADEMIC_SETTINGS = [ROLES.ADMIN] as const;

export type UserRoles = (typeof ROLES)[keyof typeof ROLES];