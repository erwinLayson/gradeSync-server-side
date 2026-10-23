import ClassroomModel from "../model/classrooms.js";

// Configure the database connection
import { getDBPoolConnection } from "../config/database.js";

import type {ClassroomResponse} from "../constant/classrooms.js";
import { ConflictError, NotFoundError } from "../middleware/errors.js";
import type { PoolConnection } from "mysql2/promise";

// Backend guard: only teaching faculty may be a class adviser (plan §6.2).
import { assertOnlyTeachingFaculty } from "./faculties.js";
// Reuse the gradebook computation so honor rankings use the same quarter grades
// the adviser already sees in My Class > Grades.
import { getGradeBookDetailsByClassSubjectIdService } from "./gradebook.js";


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

// Get classroom faculties with subject
export async function getClassroomFacultiesWithSubjectService(classroomId: number) {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        const classroomModel = new ClassroomModel(connection);
        const classroomFacultiesWithSubject = await classroomModel.getClassroomFacultiesWithSubject(classroomId);
        return classroomFacultiesWithSubject;
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
// The adviser assignment is cleared so the faculty isn't trapped on a hidden class.
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

        // Free the adviser so the one-class-per-faculty rule doesn't trap them.
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

// Get the full details of the class a faculty advises:
// classroom info + students roster + all faculties with subjects.
export async function getMyAdvisedClassService(facultyId: number) {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        const classroomModel = new ClassroomModel(connection);
        const classId = await classroomModel.getClassIdByAdviser(facultyId);
        if (classId === null) {
            return null;
        }
        const classroom = await classroomModel.getClassroomById(classId);
        const facultiesWithSubjects = await classroomModel.getClassroomFacultiesWithSubject(classId);
        return {
            classroom,
            facultiesWithSubjects
        };
    } finally {
        connection.release();
    }
}

// One ranked student in the adviser's class honor roll.
export interface AdviserHonorStudent {
    rank: number;
    enrollmentId: number;
    studentId: number;
    studentLrn: string;
    fullname: string;
    average: number;
    gradedSubjects: number;
}

// Honor roll for the class a faculty advises, ranked by the average of every
// subject's quarter grade. Returns null when the faculty advises no class, so
// the feature stays restricted to actual class advisers.
export interface AdviserHonorStudents {
    classId: number;
    classSection: string;
    classGradeLevel: number;
    quarter: number;
    passingGrade: number;
    students: AdviserHonorStudent[];
}

// Minimum average required to be included in the honor roll. Configurable so
// schools can adjust the cutoff without a code change. Falls back to 85 when
// the variable is absent (e.g. an older deployment environment).
const DEFAULT_HONOR_PASSING_GRADE = 85;

function getHonorPassingGrade(): number {
    const raw = process.env.HONOR_STUDENT_PASSING_GRADE;
    if (raw === undefined || raw.trim() === "") {
        return DEFAULT_HONOR_PASSING_GRADE;
    }
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0 || value > 100) {
        throw new Error("HONOR_STUDENT_PASSING_GRADE must be a number between 0 and 100");
    }
    return value;
}

interface HonorAccumulator {
    enrollmentId: number;
    studentId: number;
    studentLrn: string;
    fullname: string;
    gradeSum: number;
    gradedSubjects: number;
}

export async function getMyAdvisedClassHonorStudentsService(
    facultyId: number,
    quarter: number,
): Promise<AdviserHonorStudents | null> {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        const classroomModel = new ClassroomModel(connection);
        const classId = await classroomModel.getClassIdByAdviser(facultyId);
        if (classId === null) {
            return null;
        }

        const classroom = await classroomModel.getClassroomById(classId);
        if (!classroom) {
            throw new NotFoundError("Classroom not found", 404);
        }
        const subjects = await classroomModel.getClassroomFacultiesWithSubject(classId);
        const passingGrade = getHonorPassingGrade();

        // Average every subject's quarter grade per student. Only subjects that
        // actually produced a grade for that student count, so a partially
        // graded quarter never drags an average down with zeroes.
        const byEnrollment = new Map<number, HonorAccumulator>();
        for (const subject of subjects) {
            const details = await getGradeBookDetailsByClassSubjectIdService(subject.classSubjectId, quarter);
            for (const row of details.student) {
                if (row.quarterGrade === null || row.quarterGrade === undefined) continue;
                const grade = Number(row.quarterGrade);
                if (Number.isNaN(grade)) continue;

                const existing = byEnrollment.get(row.enrollmentId);
                if (existing) {
                    existing.gradeSum += grade;
                    existing.gradedSubjects += 1;
                } else {
                    byEnrollment.set(row.enrollmentId, {
                        enrollmentId: row.enrollmentId,
                        studentId: row.studentId,
                        studentLrn: row.studentLrn,
                        fullname: row.fullname,
                        gradeSum: grade,
                        gradedSubjects: 1,
                    });
                }
            }
        }

        // Every student at or above the passing average is an honor student.
        const students: AdviserHonorStudent[] = [...byEnrollment.values()]
            .map((student) => ({
                enrollmentId: student.enrollmentId,
                studentId: student.studentId,
                studentLrn: student.studentLrn,
                fullname: student.fullname,
                average: Math.round((student.gradeSum / student.gradedSubjects) * 100) / 100,
                gradedSubjects: student.gradedSubjects,
            }))
            .filter((student) => student.average >= passingGrade)
            .sort((a, b) => b.average - a.average || a.fullname.localeCompare(b.fullname))
            .map((student, index) => ({ ...student, rank: index + 1 }));

        return {
            classId,
            classSection: classroom.section,
            classGradeLevel: classroom.gradeLevel,
            quarter,
            passingGrade,
            students,
        };
    } finally {
        connection.release();
    }
}

// Assign (or clear) the class adviser for a classroom.
// facultyId = null clears the adviser. A faculty may advise at most one class,
// so assigning a faculty who already advises a DIFFERENT class is rejected.
export async function setClassAdviserService(classId: number, facultyId: number | null) {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const classroomModel = new ClassroomModel(connection);
        const classroom = await classroomModel.getClassroomById(classId);
        if (!classroom) {
            throw new NotFoundError("Classroom not found", 404);
        }

        if (facultyId !== null) {
            // A register faculty member must never become a class adviser —
            // enforced here, not only in the dropdown (plan §6.2).
            await assertOnlyTeachingFaculty(connection, facultyId);
            // One class per faculty: the faculty must not already advise another class.
            const existingClassId = await classroomModel.getClassIdByAdviser(facultyId);
            if (existingClassId !== null && existingClassId !== classId) {
                throw new ConflictError("Faculty is already the class adviser of another classroom. Reassign that class first.");
            }
        }

        await classroomModel.setClassAdviser(classId, facultyId);
        await connection.commit();
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}
