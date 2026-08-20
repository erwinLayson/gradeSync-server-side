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
    STUDENT: "student"
} as const;

export type UserRoles = (typeof ROLES)[keyof typeof ROLES];