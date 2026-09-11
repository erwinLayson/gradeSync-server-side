import ClassroomModel from "../model/classrooms.js";

// Configure the database connection
import { getDBPoolConnection } from "../config/database.js";

import type {ClassroomResponse} from "../constant/classrooms.js";
import { ConflictError, NotFoundError } from "../middleware/errors.js";
import type { PoolConnection } from "mysql2/promise";


// Create new classroom
export async function createClassroomService(classrooms: Omit<ClassroomResponse, "id">){
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();

    try {
        const classroomModel = new ClassroomModel(connection);
        const existingClassroom = await classroomModel.getClassroomBySectionAndGradeLevel(classrooms.section, String(classrooms.gradeLevel));
        if(existingClassroom) {
            throw new ConflictError("Classroom already exists");
        }

        const classroomId = await classroomModel.createClassroom(classrooms);
        return classroomId;
    }finally {
        connection.release();
    }
}

// Get all classrooms
export async function getAllClassroomsService() {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        const classroomModel = new ClassroomModel(connection);
        const classrooms = await classroomModel.getAllClassrooms();
        return classrooms;
    }finally {
        connection.release();
    }
}

// Get classroom by ID
export async function getClassroomByIdService(id: number, existingConnection?: PoolConnection) {
    const pool = getDBPoolConnection();
    const connection = existingConnection ?? await pool.getConnection();
    const ownConnection = !existingConnection;
    try {
        const classroomModel = new ClassroomModel(connection);
        const classroom = await classroomModel.getClassroomById(id);

        if(!classroom) {
            throw new NotFoundError("Classroom not found", 404);
        }

        return classroom;
    }finally {
        if(ownConnection) {
            connection.release();
        }
    }
}

// Get classroom teachers with subject
export async function getClassroomTeachersWithSubjectService(classroomId: number) {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        const classroomModel = new ClassroomModel(connection);
        const classroomTeachersWithSubject = await classroomModel.getClassroomTeachersWithSubject(classroomId);
        return classroomTeachersWithSubject;
    }finally {
        connection.release();
    }
}

// Update a classroom's section + grade level.
// Rejects duplicates (same section + gradeLevel on a DIFFERENT classroom), mirroring create.
export async function updateClassroomService(id: number, data: { section: string; gradeLevel: string | number }) {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const classroomModel = new ClassroomModel(connection);
        const classroom = await classroomModel.getClassroomById(id);
        if (!classroom) {
            throw new NotFoundError("Classroom not found", 404);
        }

        const duplicate = await classroomModel.getClassroomBySectionAndGradeLevelExcluding(data.section, String(data.gradeLevel), id);
        if (duplicate) {
            throw new ConflictError("Classroom already exists");
        }

        const updated = await classroomModel.updateClassroom(id, data);
        if (updated === 0) {
            throw new NotFoundError("Classroom not found", 404);
        }

        await connection.commit();
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

// Archive a classroom (soft delete): hidden from lists forever, history preserved.
// Blocked while the class still has students enrolled in the ACTIVE school year.
// The adviser assignment is cleared so the teacher isn't trapped on a hidden class.
export async function archiveClassroomService(id: number) {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const classroomModel = new ClassroomModel(connection);
        const classroom = await classroomModel.getClassroomById(id);
        if (!classroom) {
            throw new NotFoundError("Classroom not found", 404);
        }

        const activeEnrollments = await classroomModel.getActiveYearEnrollmentCount(id);
        if (activeEnrollments > 0) {
            throw new ConflictError(
                `Cannot archive ${classroom.section}: ${activeEnrollments} student(s) are currently enrolled in the active school year. Transfer or unenroll them first.`
            );
        }

        // Free the adviser so the one-class-per-teacher rule doesn't trap them.
        await classroomModel.clearClassAdviserAssignment(id);

        const archived = await classroomModel.archiveClassroom(id);
        if (archived === 0) {
            throw new ConflictError("Classroom is already archived");
        }

        await connection.commit();
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

// Get the class adviser for a classroom
// Returns { adviserId, adviserFullname } (both null when unassigned).
export async function getClassAdviserService(classId: number) {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        const classroomModel = new ClassroomModel(connection);
        // The classroom itself must exist.
        const classroom = await classroomModel.getClassroomById(classId);
        if (!classroom) {
            throw new NotFoundError("Classroom not found", 404);
        }
        const adviser = await classroomModel.getClassAdviser(classId);
        return {
            classId,
            adviserId: adviser?.adviserId ?? null,
            adviserFullname: adviser?.adviserFullname ?? null
        };
    } finally {
        connection.release();
    }
}

// Get the full details of the class a teacher advises:
// classroom info + students roster + all teachers with subjects.
export async function getMyAdvisedClassService(teacherId: number) {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        const classroomModel = new ClassroomModel(connection);
        const classId = await classroomModel.getClassIdByAdviser(teacherId);
        if (classId === null) {
            return null;
        }
        const classroom = await classroomModel.getClassroomById(classId);
        const teachersWithSubjects = await classroomModel.getClassroomTeachersWithSubject(classId);
        return {
            classroom,
            teachersWithSubjects
        };
    } finally {
        connection.release();
    }
}

// Assign (or clear) the class adviser for a classroom.
// teacherId = null clears the adviser. A teacher may advise at most one class,
// so assigning a teacher who already advises a DIFFERENT class is rejected.
export async function setClassAdviserService(classId: number, teacherId: number | null) {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const classroomModel = new ClassroomModel(connection);
        const classroom = await classroomModel.getClassroomById(classId);
        if (!classroom) {
            throw new NotFoundError("Classroom not found", 404);
        }

        if (teacherId !== null) {
            // One class per teacher: the teacher must not already advise another class.
            const existingClassId = await classroomModel.getClassIdByAdviser(teacherId);
            if (existingClassId !== null && existingClassId !== classId) {
                throw new ConflictError("Teacher is already the class adviser of another classroom. Reassign that class first.");
            }
        }

        await classroomModel.setClassAdviser(classId, teacherId);
        await connection.commit();
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}
