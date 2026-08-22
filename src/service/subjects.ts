import SubjectModel from "../model/subjects.js";
import SubjectComponentsModel from "../model/subjectComponents.js";

// Configure the database connection
import { getDBPoolConnection } from "../config/database.js";

import type {Subject} from "../constant/subjects.js";
import type { ComponentCreateProps } from "../constant/subjectComponents.js";
import { ConflictError, NotFoundError } from "../middleware/errors.js";

// Services for subjects
import {getTeachersBySubjectIdService} from "./teachers.js";
import type { PoolConnection } from "mysql2/promise";

// create a new subject service (with optional components)
export async function createSubjectService(
    subject: Omit<Subject, "id">,
    components?: ComponentCreateProps[]
){
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        const subjectModel = new SubjectModel(connection);
        const subjectId = await subjectModel.createSubject(subject);

        // Create components if provided
        if (components && components.length > 0) {
            const componentModel = new SubjectComponentsModel(connection);
            await componentModel.createComponentsBatch(subjectId, components);
        }

        await connection.commit();
        return subjectId;
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

// Get all subjects service
export async function getAllSubjectsService() {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        const subjectModel = new SubjectModel(connection);
        const subjects = await subjectModel.getAllSubjects();
        return subjects;
    }finally {
        connection.release();
    }
}

// Get subject by ID service
export async function getSubjectByIdService(id: number) {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        const subjectModel = new SubjectModel(connection);
        const subject = await subjectModel.getSubjectById(id);

        if(!subject) {
            throw new NotFoundError(`Subject with ID ${id} not found`, 404);
        }

        return subject;
    }finally {
        connection.release();
    }
}


// Update a subject's name/code/unit.
export async function updateSubjectService(id: number, data: { name: string; code: string; unit: string | number }) {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const subjectModel = new SubjectModel(connection);
        const subject = await subjectModel.getSubjectById(id);
        if (!subject) {
            throw new NotFoundError(`Subject with ID ${id} not found`, 404);
        }

        const updated = await subjectModel.updateSubject(id, data);
        if (updated === 0) {
            throw new NotFoundError(`Subject with ID ${id} not found`, 404);
        }

        await connection.commit();
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

// Delete a subject — only when nothing LIVE references it anymore.
// Class teaching, the teacher pool, and enrollment records block the delete
// with a readable 409. Frozen student records do NOT block: they keep their
// own name/code snapshot (migration step 12), so deleting the catalog entry
// can never touch existing academic records.
export async function deleteSubjectService(id: number) {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const subjectModel = new SubjectModel(connection);
        const subject = await subjectModel.getSubjectById(id);
        if (!subject) {
            throw new NotFoundError(`Subject with ID ${id} not found`, 404);
        }

        const usage = await subjectModel.getSubjectUsage(id);
        const reasons: string[] = [];
        if (usage.classes > 0) reasons.push(`taught in ${usage.classes} class${usage.classes === 1 ? "" : "es"}`);
        if (usage.teachers > 0) reasons.push(`assigned to ${usage.teachers} teacher${usage.teachers === 1 ? "" : "s"}`);
        if (usage.enrollments > 0) reasons.push(`on ${usage.enrollments} enrollment record${usage.enrollments === 1 ? "" : "s"}`);
        if (reasons.length > 0) {
            throw new ConflictError(
                `Cannot delete ${subject.name}: ${reasons.join(", ")}. Remove these references first.`
            );
        }

        const deleted = await subjectModel.deleteSubject(id);
        if (deleted === 0) {
            throw new NotFoundError(`Subject with ID ${id} not found`, 404);
        }

        await connection.commit();
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

// Get subject by ID with teachers and components service
export async function getSubjectByIdWithTeachersService(subjectId: number) {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        const subjectModel = new SubjectModel(connection);
        const subject = await subjectModel.getSubjectById(subjectId);

        if (!subject) {
            throw new NotFoundError(`Subject with ID ${subjectId} not found`, 404);
        }

        // Fetch teachers associated with the subject
        const teachers = await getTeachersBySubjectIdService(subjectId, connection);

        // Fetch components if subject has them
        const componentModel = new SubjectComponentsModel(connection);
        const components = subject.hasComponents 
            ? await componentModel.getSubjectComponents(subjectId)
            : [];

        // Combine subject, teachers, and components into a single object.
        const subjectWithDetails = {
            ...subject,
            teachers: teachers.map(teacher => ({ id: teacher.id, name: teacher.fullname })),
            components
        };

        return subjectWithDetails; 
       
    } finally {
        connection.release();
    }
}

// Get teachers unassigned to a specific subject service
export async function getTeachersUnassignedToSubjectService(subjectId: number) {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        const subjectModel = new SubjectModel(connection);
        const teachers = await subjectModel.getTeachersUnassignedToSubject(subjectId);
        return teachers;
    }finally {
        connection.release();
    }
}

// Assign teachers to a specific subject service
export async function assignTeachersToSubjectService({subjectId, teachersId}: {subjectId: number, teachersId: number[]}): Promise<void> {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        const subjectModel = new SubjectModel(connection);
        await subjectModel.assignTeachersToSubject({subjectId, teachersId});
    }finally {
        connection.release();
    }
}

// Remove a teacher from a subject's teacher pool.
// 404 when the subject or the assignment does not exist.
// When the teacher still teaches this subject in a live class (class_subjects),
// the removal is still performed — per the product decision — and the response
// carries a warning so the client can tell the admin what remains in place.
export async function unassignTeacherFromSubjectService(subjectId: number, teacherId: number) {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        const subjectModel = new SubjectModel(connection);

        const subject = await subjectModel.getSubjectById(subjectId);
        if (!subject) {
            throw new NotFoundError(`Subject with ID ${subjectId} not found`, 404);
        }

        const deleted = await subjectModel.unassignTeacherFromSubject(subjectId, teacherId);
        if (deleted === 0) {
            throw new NotFoundError(`Teacher ${teacherId} is not assigned to subject ${subjectId}`, 404);
        }

        // Per the product decision, removing from the teacher pool is allowed even
        // when the teacher still teaches this subject in a classroom — we just warn.
        const teachingInClass = await subjectModel.isTeacherTeachingSubjectInClass(subjectId, teacherId);

        return {
            removed: true,
            warning: teachingInClass
                ? "Teacher was also assigned to teach this subject in one or more classrooms. Those class assignments remain — reassign them from the Classrooms page if needed."
                : null
        };
    } finally {
        connection.release();
    }
}


// Get subjects with assigned teachers not in a specific class service
export async function getSubjectsWithAssignedTeachersNotInClassService({ classId, subjectId }: { classId: number, subjectId: number }, existingConnection?: PoolConnection) {
    const pool = getDBPoolConnection();
    const connection = existingConnection ?? await pool.getConnection();
    const ownConnection = !existingConnection; // Flag to check if we own the connection
    try {
        const subjectModel = new SubjectModel(connection);
        const subjectsWithTeachers = await subjectModel.getSubjectsWithAssignedTeachersNotInClass(classId, subjectId);
        return subjectsWithTeachers;
    }finally {
        if(ownConnection) {
            connection.release();
        }
    }
}

// get subjects with teachers not in a specific class service
export async function getSubjectsNotInClassService(classId: number) {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        const subjectModel = new SubjectModel(connection);
        const subjects = await subjectModel.getSubjectsNotInClass(classId);
        const subjectArr = new Map<number, {
            subjectId: number;
            subjectName: string;
            subjectCode: string;
            subjectUnit: number;
            teachers: { teacherId: number; teacherFullname: string }[];
        }>();

        for (const s of subjects) {
            if(!subjectArr.has(s.subjectId)) {
                subjectArr.set(s.subjectId, {
                    subjectId: s.subjectId,
                    subjectName: s.subjectName,
                    subjectCode: s.subjectCode,
                    subjectUnit: s.subjectUnit,
                    teachers: []
                });
            }

            const currentSubjectTeachers = subjectArr.get(s.subjectId);
            currentSubjectTeachers?.teachers.push({
                teacherId: s.teacherId,
                teacherFullname: s.teacherFullname
            });
        }
        return Array.from(subjectArr.values());
    }finally {
        connection.release();
    }
}
