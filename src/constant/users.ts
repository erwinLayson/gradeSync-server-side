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
    DEVELOPER: "developer",
    // Registration/enrollment staff: enrolls students (existing or newly
    // created) and prints SF10/Form-137 records. See
    // docs/register-role-implementation-plan.md.
    REGISTER: "register"
} as const;

/** Roles that may read academic settings (admin, teacher, register). */
export const ALLOWED_TO_READ_ACADEMIC_SETTINGS = [
    ROLES.ADMIN,
    ROLES.TEACHER,
    ROLES.REGISTER,
] as const;

/** Roles that may update academic settings (admin only). */
export const ALLOWED_TO_EDIT_ACADEMIC_SETTINGS = [ROLES.ADMIN] as const;

export type UserRoles = (typeof ROLES)[keyof typeof ROLES];