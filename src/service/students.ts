import {PoolConnection} from "mysql2/promise"

import StudentModel from "../model/students.js";
import UserModel from "../model/users.js";
import { getDBPoolConnection } from "../config/database.js";
 
import type{StudentCreateProps} from "../constant/students.js"
import {ROLES} from "../constant/users.js"

// Service functions for managing students
import {createUserService, updateUserByUserIdService} from "./users.js"

// Error handling
import { ConflictError, NotFoundError } from "../middleware/errors.js";
import { formatDate } from "../helper/formatDate.js";

import getEnv from "../helper/getEnv.js"

// Create new student service
export async function createStudentService(student: StudentCreateProps, existingConnection?: PoolConnection) {
    const pool = getDBPoolConnection();
    const connection = existingConnection ?? await pool.getConnection();
    const ownConnection = !existingConnection;
    try {
        if(ownConnection) {
            await connection.beginTransaction();
        }
        const newStudentUser = {
            email: student.email,
            password: getEnv("DEFAULT_PASSWORD"),
            role: ROLES.STUDENT
        }
        

        const newUserId = await createUserService(newStudentUser, connection);
        
        if(!newUserId) {
            throw new Error("Failed to create user for student");
        }

        const studentModel = new StudentModel(connection);
        const studentId = await studentModel.createStudents({...student, userId: newUserId});

        if(ownConnection) {
            await connection.commit();
        }

        return studentId
    }catch(err) {
        if(ownConnection) {
            await connection.rollback();
        }
        throw err;
    }finally {
        if(ownConnection) {
            connection.release();
        }
    }
}

// Get student by ID service
export async function getStudentByIdService(id: number, existingConnection?: PoolConnection){
    const pool = getDBPoolConnection();
    const connection = existingConnection ?? await pool.getConnection();
    const ownConnection = !existingConnection; 
    try {
        const studentModel = new StudentModel(connection); 
        const student = await studentModel.getStudentById(id);

        if(student === null) {
            throw new NotFoundError(`Student with ID ${id} not found`, 404);
        }

        // mysql2 returns DATE columns as JS Date objects; serialize them as a
        // plain yyyy-mm-dd string so the client date input never shifts a day.
        const rawBirthdate = student.birthdate as unknown;
        const birthdate = rawBirthdate instanceof Date
            ? [
                rawBirthdate.getFullYear(),
                String(rawBirthdate.getMonth() + 1).padStart(2, "0"),
                String(rawBirthdate.getDate()).padStart(2, "0")
            ].join("-")
            : String(rawBirthdate).slice(0, 10);

        return {
            ...student,
            birthdate
        };
    }finally {
        if(ownConnection) {
            connection.release();
        }
    }
}

// Get all student service
export async function getAllStudentService(){
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        const studentModel = new StudentModel(connection); 
        const students = await studentModel.getAllStudent();
        return students.map((s) => ({
            id: s.id,
            lrn: s.lrn,
            email: s.email,
            firstname: s.firstname,
            middlename: s.middlename,
            lastname: s.lastname,
            suffix: s.suffix,
            fullname: s.fullname,
            birthdate: new Date(s.birthdate).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "2-digit" }),
            sex: s.sex,
            status: s.status
        }));
    }finally {
        connection.release();
    }
}

// This function is exported to class Student service to get students by classroom ID
export async function getStudentByClassroomIdService(id: number, existingConnection?: PoolConnection) {
    const pool = getDBPoolConnection();
    const connection = existingConnection ?? await pool.getConnection();
    const ownConnection = !existingConnection;
    try {
        if(ownConnection) {
            await connection.beginTransaction();
        }

        const studentModel = new StudentModel(connection);
        const students = await studentModel.getStudentByClassroomId(id);

        return students;
    }finally {
        if(ownConnection) {
            connection.release();
        }
    }
}

// Get all not enrolled students service
export async function getAllNotEnrolledStudentsService(searchQuery: string, schoolYearId?: number) {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        const studentModel = new StudentModel(connection);
        const students = await studentModel.getAllNotEnrolledStudents(searchQuery, schoolYearId);
        return students.map(s => ({
            ...s,
            birthdate: formatDate(s.birthdate),
            created_at: formatDate(s.created_at),
            updated_at: s.updated_at ? formatDate(s.updated_at) : null,
        }))
    }finally {
        connection.release();
    }
}

// Update student by ID service
// When the student email changes, the linked login account email is kept in
// sync inside the same transaction so the student can still log in.
export async function updateStudentByIdService(id: number, student: Partial<StudentCreateProps>, existingConnection?: PoolConnection) {
    const pool = getDBPoolConnection();
    const connection = existingConnection ?? await pool.getConnection();
    const ownConnection = !existingConnection;
    try {
        if(ownConnection) {
            await connection.beginTransaction();
        }

        const studentModel = new StudentModel(connection);
        const existing = await studentModel.getStudentById(id);

        if (existing === null) {
            throw new NotFoundError(`Student with ID ${id} not found`, 404);
        }

        if (student.email !== undefined && student.email !== existing.email && existing.userId !== undefined) {
            const userModel = new UserModel(connection);
            const emailOwner = await userModel.getUserByEmail(student.email);

            if (emailOwner && emailOwner.id !== existing.userId) {
                throw new ConflictError(`Email ${student.email} is already in use`);
            }

            // System-driven sync (admin context): no current-password check needed.
            await updateUserByUserIdService(existing.userId, { email: student.email }, false, connection);
        }

        await studentModel.updateStudentById(id, student);

        if(ownConnection) {
            await connection.commit();
        }
    }catch(err) {
        if(ownConnection) {
            await connection.rollback();
        }
        throw err;
    }
    finally {
        if(ownConnection) {
            connection.release();
        }
    }
}

// Soft delete student by ID service.
// The student row is kept (status = "inactive") so enrollments, grades, and
// attendance history survive, but the linked login account is deactivated so
// the student can no longer sign in. Both changes commit together.
export async function deleteStudentByIdService(id: number, existingConnection?: PoolConnection) {
    const pool = getDBPoolConnection();
    const connection = existingConnection ?? await pool.getConnection();
    const ownConnection = !existingConnection;
    try {
        if(ownConnection) {
            await connection.beginTransaction();
        }

        const studentModel = new StudentModel(connection);
        const existing = await studentModel.getStudentById(id);

        if (existing === null) {
            throw new NotFoundError(`Student with ID ${id} not found`, 404);
        }

        // Deactivate the linked login account (only if one exists).
        if (existing.userId !== undefined) {
            const userModel = new UserModel(connection);
            await userModel.updateUserStatus(existing.userId, "inactive");
        }

        await studentModel.deleteStudentById(id);

        if(ownConnection) {
            await connection.commit();
        }
    }catch(err) {
        if(ownConnection) {
            await connection.rollback();
        }
        throw err;
    }
    finally {
        if(ownConnection) {
            connection.release();
        }
    }
}