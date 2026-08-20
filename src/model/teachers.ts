import {PoolConnection} from "mysql2/promise";
import type{ResultSetHeader, RowDataPacket} from "mysql2/promise";
// Error Handling
import { InternalServerError } from "../middleware/errors.js";
// Types constant
import type { TeacherProps, TeacherResponse, TeacherDetails, TeacherUpdateProps, TeacherSubjectDetails } from "../constant/teachers.js";

export default class Teacher {
    constructor(private connection: PoolConnection) {}

    // Create a new teacher
    async createTeacher(teacher: TeacherProps): Promise<number> {
        const {userId, email, firstname, middlename, lastname, suffix} = teacher;
        try {
            const query = `INSERT INTO teachers (userId, email, firstname, middlename, lastname, suffix) VALUES (?, ?, ?, ?, ?, ?)`;

            const values = [userId, email, firstname, middlename, lastname, suffix ?? null];
            const [result] = await this.connection.execute<ResultSetHeader>(query, values);
            return result.insertId;
        }catch(err) {
            throw new InternalServerError("Failed to create teacher", 500, err);
        } 
    }

    // Get all teachers
    async getAllTeachers(): Promise<TeacherResponse[]> {
        try {
            const query = `
            SELECT 
            id,
            email,
            CONCAT(firstname, ' ', middlename, ' ', lastname, IF(suffix IS NOT NULL, CONCAT(' ', suffix), '')) AS fullname
            FROM teachers`;
            const [rows] = await this.connection.execute<RowDataPacket[]>(query);
            return rows as TeacherResponse[];
        }catch(err) {
            throw new InternalServerError("Failed to get all teachers", 500, err);
        }
    }

    // Get teacher by user ID
    async getTeacherByUserId(userId: number): Promise<TeacherDetails | null> {
        try {
            const query = `
            SELECT 
            id,
            userId,
            email,
            firstname,
            middlename,
            lastname,
            suffix,
            CONCAT(firstname, ' ', middlename, ' ', lastname, IF(suffix IS NOT NULL, CONCAT(' ', suffix), '')) AS fullname
            FROM teachers WHERE userId = ?`;
            const [rows] = await this.connection.execute<RowDataPacket[]>(query, [userId]);
            if (rows.length === 0) {
                return null;
            }
            const teacher = rows[0] as TeacherDetails;
            return teacher;
        }catch(err) {
            throw new InternalServerError("Failed to get teacher by user ID", 500, err);
        }
    }

    // Get teacher by ID
    async getTeacherById(teacherId: number): Promise<TeacherDetails | null> {
        try {
            const query = `
            SELECT 
            id,
            userId,
            email,
            firstname,
            middlename,
            lastname,
            suffix,
            CONCAT(firstname, ' ', middlename, ' ', lastname, IF(suffix IS NOT NULL, CONCAT(' ', suffix), '')) AS fullname
            FROM teachers WHERE id = ?`;
            const [rows] = await this.connection.execute<RowDataPacket[]>(query, [teacherId]);
            if (rows.length === 0) {
                return null;
            }
            const teacher = rows[0] as TeacherDetails;
            return teacher;
        }catch(err) {
            throw new InternalServerError("Failed to get teacher by ID", 500, err);
        }
    }

    // Count class-adviser assignments for a teacher (class_teacher is ON DELETE RESTRICT)
    async getClassTeacherAssignmentCount(teacherId: number): Promise<number> {
        try {
            const query = "SELECT COUNT(*) AS count FROM class_teacher WHERE teacherId = ?";
            const [rows] = await this.connection.execute<RowDataPacket[]>(query, [teacherId]);
            return Number((rows[0] as { count: number }).count);
        }catch(err) {
            throw new InternalServerError("Failed to check teacher assignments", 500, err);
        }
    }

    // Delete teacher by ID
    async deleteTeacher(teacherId: number): Promise<void> {
        try {
            const query = "DELETE FROM teachers WHERE id = ?";
            await this.connection.execute<ResultSetHeader>(query, [teacherId]);
        }catch(err) {
            throw new InternalServerError("Failed to delete teacher", 500, err);
        }
    }

    // Update teacher by ID
    async updateTeacher(teacherId: number, teacher: TeacherUpdateProps): Promise<void> {
        const updateFields: string[] = [];
        const values: (string | null)[] = [];

        for (const field of ["email", "firstname", "middlename", "lastname", "suffix"] as const) {
            if (field in teacher) {
                updateFields.push(`${field} = ?`);
                values.push((teacher as Record<string, string | null | undefined>)[field] ?? null);
            }
        }

        if (updateFields.length === 0) {
            return;
        }

        try {
            const query = `
            UPDATE teachers
            SET ${updateFields.join(", ")}
            WHERE id = ?`;
            await this.connection.execute<ResultSetHeader>(query, [...values, teacherId]);
        }catch(err) {
            throw new InternalServerError("Failed to update teacher", 500, err);
        }
    }


    // Get teacher by email
    async getTeacherByEmail(email: string): Promise<TeacherResponse | null> {
        try {
            const query = `
            SELECT 
            id,
            email,
            CONCAT(firstname, ' ', middlename, ' ', lastname, IF(suffix IS NOT NULL, CONCAT(' ', suffix), '')) AS fullname
            FROM teachers WHERE email = ?`;
            const [rows] = await this.connection.execute<RowDataPacket[]>(query, [email]);
            if (rows.length === 0) {
                return null;
            }
            const teacher = rows[0] as TeacherResponse;
            return teacher;
        }catch(err) {
            throw new InternalServerError("Failed to get teacher by email", 500, err);
        }
    }


    async getTeachersBySubjectId(subjectId: number): Promise<TeacherResponse[]> {
        try {
            const query = `
                SELECT 
                t.id,
                t.email,
                CONCAT(t.firstname, ' ', t.middlename, ' ', t.lastname, IF(t.suffix IS NOT NULL, CONCAT(' ', t.suffix), '')) AS fullname
                FROM teacher_subject_assignment tsa
                JOIN teachers t 
                ON tsa.teacherId = t.id
                WHERE tsa.subjectId = ?
            `;
            const [rows] = await this.connection.execute<RowDataPacket[]>(query, [subjectId]);
            return rows as TeacherResponse[];
        } catch (err) {
            throw new InternalServerError("Failed to get teachers by subject ID", 500, err);
        }
    }

    // Get teacher subject details by teachers ID
    async getTeacherSubjectDetailsTeacherByIdService(teacherId: number): Promise<TeacherSubjectDetails[] | null> {
        try {
            const query = `
                SELECT 
                cs.id AS classSubjectId,
                s.id AS subjectId,
                s.name AS subjectName,
                s.code AS subjectCode,
                s.unit AS subjectUnit,
                c.id AS classId,
                c.section AS classSection,
                c.gradeLevel AS classGradeLevel
                FROM teachers t
                JOIN class_subjects cs ON cs.teacherId = t.id
                JOIN subjects s ON cs.subjectId = s.id
                LEFT JOIN classrooms c ON c.id = cs.classId
                WHERE t.id = ?
            `;
            const [rows] = await this.connection.execute<RowDataPacket[]>(query, [teacherId]);
            if (rows.length === 0) {
                return null;
            }
            const teacher = rows as TeacherSubjectDetails[];
            return teacher;
        } catch (err) {
            throw new InternalServerError("Failed to get teacher details by ID", 500, err);
        }
    }
}