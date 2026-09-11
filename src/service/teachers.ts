import TeacherModel from "../model/teachers.js";
import UserModel from "../model/users.js";

import { getDBPoolConnection } from "../config/database.js";

// Types constant
import type { TeacherProps, TeacherUpdateProps } from "../constant/teachers.js";
import { ConflictError, NotFoundError } from "../middleware/errors.js";
import type { PoolConnection } from "mysql2/promise";

// Service functions for managing teachers
import { createUserService, updateUserByUserIdService } from "./users.js";


// Helper function to get environment variables
import getEnv from "../helper/getEnv.js";

import { ROLES } from "../constant/users.js";

// Create a new teacher service
export async function CreateTeacherService(teacher: Omit<TeacherProps, "userId">) {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const teacherModel = new TeacherModel(connection);

        const newTeacherUser = {
            email: teacher.email,
            password: getEnv("DEFAULT_PASSWORD"),
            role: ROLES.TEACHER 
        };

        const newUserId = await createUserService(newTeacherUser, connection);

        if (!newUserId) {
            throw new Error("Failed to create user for teacher");
        }

        const teacherId = await teacherModel.createTeacher({...teacher, userId: newUserId});

        await connection.commit();

        return teacherId;
    }catch (error) {
        await connection.rollback();
        throw error;
    }finally {
        connection.release();
    }
}

// Get all teachers service
export async function getAllTeachersService() {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        const teacherModel = new TeacherModel(connection);
        const teachers = await teacherModel.getAllTeachers();
        return teachers;
    }finally {
        connection.release();
    }
}

// Delete teacher by ID service
// Removes the teacher record and their linked login account together.
export async function deleteTeacherService(teacherId: number) {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const teacherModel = new TeacherModel(connection);
        const existing = await teacherModel.getTeacherById(teacherId);

        if(!existing) {
            throw new NotFoundError(`Teacher with ID ${teacherId} not found`, 404);
        }

        const adviserAssignments = await teacherModel.getClassTeacherAssignmentCount(teacherId);
        if (adviserAssignments > 0) {
            throw new ConflictError("Teacher is assigned as a class adviser and cannot be deleted. Reassign the class first.");
        }

        await teacherModel.deleteTeacher(teacherId);

        const userModel = new UserModel(connection);
        await userModel.deleteUserById(existing.userId);

        await connection.commit();
    }catch (error) {
        await connection.rollback();
        throw error;
    }finally {
        connection.release();
    }
}

// Get teacher by user ID service
export async function getTeacherByUserIdService(userId: number) {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        const teacherModel = new TeacherModel(connection);
        const teacher = await teacherModel.getTeacherByUserId(userId);

        if(!teacher) {
            throw new NotFoundError(`Teacher account not found for user ${userId}`, 404);
        }

        return teacher;
    }finally {
        connection.release();
    }
}

// Get teacher by ID service
export async function getTeacherByIdService(teacherId: number) {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        const teacherModel = new TeacherModel(connection);
        const teacher = await teacherModel.getTeacherById(teacherId);

        if(!teacher) {
            throw new NotFoundError(`Teacher with ID ${teacherId} not found`, 404);
        }

        return teacher;
    }finally {
        connection.release();
    }
}

// Update teacher by ID service
// Keeps the linked user account email in sync so teacher login keeps working.
export async function updateTeacherService(teacherId: number, teacher: TeacherUpdateProps) {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const teacherModel = new TeacherModel(connection);
        const existing = await teacherModel.getTeacherById(teacherId);

        if(!existing) {
            throw new NotFoundError(`Teacher with ID ${teacherId} not found`, 404);
        }

        await teacherModel.updateTeacher(teacherId, teacher);

        if (teacher.email && existing.email !== teacher.email) {
            // System-driven sync (admin context): no current-password check needed.
            await updateUserByUserIdService(existing.userId, { email: teacher.email }, false, connection);
        }

        await connection.commit();
    }catch (error) {
        await connection.rollback();
        throw error;
    }finally {
        connection.release();
    }
}

export async function getTeachersBySubjectIdService(subjectId: number, existingConnection?: PoolConnection) {
    const pool = getDBPoolConnection();
    const connection = existingConnection ?? await pool.getConnection();
    const ownConnection = !existingConnection; 
    try {
        const teacherModel = new TeacherModel(connection);
        const teachers = await teacherModel.getTeachersBySubjectId(subjectId);
        return teachers;
    }finally {
        if (ownConnection) {
            connection.release();
        }
    }
}

// Get teacher subject details by teachers ID service
export async function getTeacherSubjectDetailsTeacherByIdService(teacherId: number, existingConnection?: PoolConnection) {
    const pool = getDBPoolConnection();
    const connection = existingConnection ?? await pool.getConnection();
    const ownConnection = !existingConnection;
    try {
        const teacherModel = new TeacherModel(connection);
        const teacherDetails = await teacherModel.getTeacherSubjectDetailsTeacherByIdService(teacherId);
        return teacherDetails;
    }finally {
        if (ownConnection) {
            connection.release();
        }
    }
}