import { PoolConnection } from "mysql2/promise";
import type{ResultSetHeader, RowDataPacket} from "mysql2/promise";

import type{CreateUserProps, UserResponseProps, UserRoles} from "../constant/users.js";


import {InternalServerError} from "../middleware/errors.js";


export default class Users {
    constructor(private connection: PoolConnection) {}

    // Create new User
    async createUser(user: CreateUserProps):Promise<number> {
        const {email, password, role} = user;
         try {
            const query = "INSERT INTO users(email, password, role) VALUES(?,?,?)";
            const values = [email, password, role];
            const [result] = await this.connection.execute<ResultSetHeader>(query, values);

            return result.insertId;
        }catch(err) {
            console.log(err);
            throw new InternalServerError("Internal server error", 500, err);
        }
    }

    // get all users
    async getAllUsers():Promise<UserResponseProps[]> {
        try {
            const query =` 
            SELECT 
            id,
            email,
            role,
            status
            FROM users`
            ;
            const [rows] = await this.connection.execute<RowDataPacket[]>(query);
            return rows as UserResponseProps[];
        }catch(err) {
            console.log(err);
            throw new InternalServerError("Internal server error", 500, err)
        }
    }

    // Get user by User ID 
    async getUserById(id: number):Promise<UserResponseProps | null> {
        try {
            const query = `
            SELECT 
            id,
            email,
            role,
            status
            FROM users WHERE id = ?`;
            const [rows] = await this.connection.execute<RowDataPacket[]>(query, [id]);
            return rows.length > 0 ? rows[0] as UserResponseProps : null;
        }catch(err) {
            console.log(err);
            throw new InternalServerError("Internal server error", 500, err)
        }
    }

    // Deactivate / reactivate a user account by ID
    async updateUserStatus(userId: number, status: "active" | "inactive"):Promise<void> {
        try {
            const query = "UPDATE users SET status = ? WHERE id = ?";
            await this.connection.execute<ResultSetHeader>(query, [status, userId]);
        }catch(err) {
            console.log(err);
            throw new InternalServerError("Internal server error", 500, err);
        }
    }


    // Change a user's role by ID (developer account management only —
    // never reachable through the credentials PUT, which whitelists
    // email/password to prevent escalation).
    async updateUserRole(userId: number, role: UserRoles):Promise<void> {
        try {
            const query = "UPDATE users SET role = ? WHERE id = ?";
            await this.connection.execute<ResultSetHeader>(query, [role, userId]);
        }catch(err) {
            throw new InternalServerError("Internal server error", 500, err);
        }
    }

    // Count of currently-active accounts with the given role. Powers the
    // "last active developer" guardrail (docs/developer-users-plan.md §3.2).
    async countActiveUsersByRole(role: UserRoles):Promise<number> {
        try {
            const query = "SELECT COUNT(*) AS cnt FROM users WHERE role = ? AND status = 'active'";
            const [rows] = await this.connection.execute<RowDataPacket[]>(query, [role]);
            return Number(rows[0]?.cnt ?? 0);
        }catch(err) {
            throw new InternalServerError("Internal server error", 500, err);
        }
    }

    // Delete user by ID
    async deleteUserById(userId: number):Promise<void> {
        try {
            const query = "DELETE FROM users WHERE id = ?";
            await this.connection.execute<ResultSetHeader>(query, [userId]);
        }catch(err) {
            console.log(err);
            throw new InternalServerError("Internal server error", 500, err);
        }
    }

    async updateUserByUserId(userId: number, newUserCredentials: Partial<Omit<CreateUserProps, "role">>):Promise<number> {
        try {
            const updateFields: string[] = [];
            const updatedValues: (string | number)[] = [];

            // Whitelist the updatable columns: only email/password may be changed
            // through this path, so a request can never escalate role/status.
            for (const key of ["email", "password"] as const) {
                const value = newUserCredentials[key];
                if (value !== undefined) {
                    updateFields.push(`${key} = ?`);
                    updatedValues.push(value);
                }
            }

            if (updateFields.length === 0) {
                return 0;
            }

            const query = `UPDATE users SET ${updateFields.join(", ")} WHERE id = ?`;
            updatedValues.push(userId);
            const [result] = await this.connection.execute<ResultSetHeader>(query, updatedValues);

            return result.affectedRows;
        }catch(err) {
            console.log(err);
            throw new InternalServerError("Internal server error", 500, err);
        }
    }

    // Get a user's auth record by ID, including the password hash so the
    // current password can be verified before a change.
    async getUserAuthById(id: number):Promise<UserResponseProps | null> {
        try {
            const query = `
            SELECT 
            id,
            email,
            role,
            password,
            status
            FROM users WHERE id = ?`;
            const [rows] = await this.connection.execute<RowDataPacket[]>(query, [id]);
            return rows.length > 0 ? rows[0] as UserResponseProps : null;
        }catch(err) {
            console.log(err);
            throw new InternalServerError("Internal server error", 500, err)
        }
    }

    // Get user by email
    async getUserByEmail(email: string):Promise<UserResponseProps | null> {
        try {
            const query = `
            SELECT 
            id,
            email,
            role,
            password,
            status
            FROM users WHERE email = ?`;
            const [rows] = await this.connection.execute<RowDataPacket[]>(query, [email]);
            return rows.length > 0 ? rows[0] as UserResponseProps : null;
        }catch(err) {
            console.log(err);
            throw new InternalServerError("Internal server error", 500, err)
        }
    }
} 