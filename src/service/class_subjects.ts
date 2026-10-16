import ClassSubjectModel from "../model/class_subjects.js";

// Configure the database connection
import { getDBPoolConnection } from "../config/database.js";
import { NotFoundError } from "../middleware/errors.js";
import type { ClassSubjectProps } from "../constant/class_subjects.js";

// Backend guard: only teaching faculty may be assigned to a class subject
// (docs/faculty-role-implementation-plan.md §6.2).
import { assertOnlyTeachingFaculty } from "./faculties.js";

// ========= service ================
import {} from "./subjects.js"

// Create a new class subject
export async function createClassSubjectService(classSubject: Omit<ClassSubjectProps, "id">[]): Promise<void> {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        const classSubjectModel = new ClassSubjectModel(connection);
        // Reject register-role targets before a single row is written (409),
        // regardless of what the client sent or filtered.
        await assertOnlyTeachingFaculty(connection, classSubject.map((s) => s.facultyId));
        await classSubjectModel.createClassSubject(classSubject);
    } finally {
        connection.release();
    }
}

// Service function to get class subject details by ID
export async function getClasssSubjectDetailsByIdService(id: number) {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        const classSubjectModel = new ClassSubjectModel(connection);
        const classSubject = await classSubjectModel.getClassSubjectDetailsById(id);


        console.log("Class Subject Details:", classSubject); // Log the retrieved class subject details

        if(!classSubject) {
            throw new NotFoundError("Class subject not found", 404);
        }

        return classSubject;
    }finally {
        connection.release();
    }
}

// Service function to update the faculty of a subject in a class by classId and subjectId
export async function updateSubjectFacultyByClassIdService(classId: number, newFacultyId: Omit<ClassSubjectProps, "id" | "classId">) {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        const classSubjectModel = new ClassSubjectModel(connection);
        await assertOnlyTeachingFaculty(connection, newFacultyId.facultyId);
        const affectedRows = await classSubjectModel.updateSubjectFacultyByClassId(classId, newFacultyId);
        
        if(affectedRows === 0) {
            throw new NotFoundError("Class subject not found or no changes made", 404);
        }

        return affectedRows;
    } finally {
        connection.release();
    }
}

export async function deleteSubjectFromClassService(classId: number, subjectId: number, facultyId: number): Promise<void> {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        const classSubjectModel = new ClassSubjectModel(connection);
        await classSubjectModel.deleteSubjectFromClass(classId, subjectId, facultyId);
    } finally {
        connection.release();
    }
}