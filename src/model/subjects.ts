import {PoolConnection} from "mysql2/promise";
import type{ResultSetHeader, RowDataPacket} from "mysql2/promise";
import { InternalServerError } from "../middleware/errors.js";

import type {Subject, AssignTeacherProps, SubjectWithTeachersNotAssignedToClass} from "../constant/subjects.js";
import type{TeacherResponse} from "../constant/teachers.js";

export default class Subjects {
    constructor(private connection: PoolConnection) {}

    // Create a new subject
    async createSubject(subject: Omit<Subject, "id">): Promise<number> {
        const {name, code, unit} = subject;
        try {
            const query = `
                INSERT INTO subjects (name, code, unit)
                VALUES (?, ?, ?)
            `;

            const values = [name, code, unit];

            const [result] = await this.connection.execute<ResultSetHeader>(query, values);
            
            return result.insertId;
        }catch(err) {
            throw new InternalServerError("Failed to create subject", 500, err);
        }
    }

    // Get all subjects
    async getAllSubjects():Promise<Subject[]> {
        try {
            const query = `
            SELECT 
            * 
            FROM 
            subjects
        `

        const [rows] = await this.connection.execute<RowDataPacket[]>(query);
        return rows as Subject[];
        }catch(err) {
            throw new InternalServerError("Failed to fetch subjects", 500, err);
        }
    }

    // Get subject by ID
    async getSubjectById(id: number): Promise<Subject | null> {
       try {
            const query = `
                SELECT 
                * 
                FROM 
                subjects
                WHERE id = ?
            `; 

            const [rows] = await this.connection.execute<RowDataPacket[]>(query, [id]);
            if (rows.length === 0) {
                return null;
            }
            return rows[0] as Subject;
       }catch(err) {
            throw new InternalServerError("Failed to fetch subject", 500, err);
        }
    }

    // Update a subject's name/code/unit. Returns affected rows (0 when the id is missing).
    async updateSubject(id: number, data: { name: string; code: string; unit: string | number }): Promise<number> {
        try {
            const query = `
                UPDATE subjects
                SET name = ?, code = ?, unit = ?
                WHERE id = ?
            `;
            const [result] = await this.connection.execute<ResultSetHeader>(query, [data.name, data.code, data.unit, id]);
            return result.affectedRows;
        } catch (err) {
            throw new InternalServerError("Failed to update subject", 500, err);
        }
    }

    // How many LIVE references point at this subject. Deleting is only allowed
    // when every count is 0 — otherwise the cascade would wipe class teaching /
    // teacher pool / enrollment rows. Frozen student records no longer count:
    // they keep their own name/code snapshot (migration step 12), so a subject
    // frozen in old records can be deleted safely (see docs/classroom-subject-management.md).
    async getSubjectUsage(subjectId: number): Promise<{ classes: number; teachers: number; enrollments: number }> {
        try {
            const [rows] = await this.connection.execute<RowDataPacket[]>(
                `
                SELECT
                    (SELECT COUNT(*) FROM class_subjects WHERE subjectId = ?) AS classes,
                    (SELECT COUNT(*) FROM teacher_subject_assignment WHERE subjectId = ?) AS teachers,
                    (SELECT COUNT(*) FROM enrollment_details WHERE subjectId = ?) AS enrollments
                `,
                [subjectId, subjectId, subjectId]
            );
            const row = rows[0] as { classes?: unknown; teachers?: unknown; enrollments?: unknown } | undefined;
            return {
                classes: Number(row?.classes ?? 0),
                teachers: Number(row?.teachers ?? 0),
                enrollments: Number(row?.enrollments ?? 0)
            };
        } catch (err) {
            throw new InternalServerError("Failed to check subject usage", 500, err);
        }
    }

    // Hard-delete an unreferenced subject. Returns affected rows (0 when missing).
    async deleteSubject(id: number): Promise<number> {
        try {
            const query = "DELETE FROM subjects WHERE id = ?";
            const [result] = await this.connection.execute<ResultSetHeader>(query, [id]);
            return result.affectedRows;
        } catch (err) {
            throw new InternalServerError("Failed to delete subject", 500, err);
        }
    }

    // Get teachers Unassigned to a specific subject
    async getTeachersUnassignedToSubject(subjectId: number): Promise<Omit<TeacherResponse, "userId">[]> {
        try {
            const query = `
                SELECT 
                    t.id,
                    CONCAT_WS(" ", t.firstname, t.middlename, t.lastname, IF(t.suffix IS NOT NULL, CONCAT(" ", t.suffix), "")) AS fullname,
                    t.email
                FROM 
                    teachers t
                WHERE 
                    t.id NOT IN (
                        SELECT 
                            tsa.teacherId
                        FROM 
                            teacher_subject_assignment tsa
                        WHERE 
                            tsa.subjectId = ?
                    )
            `;

            const [rows] = await this.connection.execute<RowDataPacket[]>(query, [subjectId]);
            return rows as any[];
        } catch (err) {
            throw new InternalServerError("Failed to fetch unassigned teachers", 500, err);
        }
    }

    // Assign teachers to a specific subject
    async assignTeachersToSubject({subjectId, teachersId}: AssignTeacherProps): Promise<void> {
        try {
            const query = `
                INSERT INTO teacher_subject_assignment (subjectId, teacherId)
                VALUES (?, ?)
            `;

            for (const teacherId of teachersId) {
                await this.connection.execute(query, [subjectId, teacherId]);
            }
        } catch (err) {
            throw new InternalServerError("Failed to assign teachers to subject", 500, err);
        }
    }

    // Whether the teacher still teaches this subject in an active class assignment.
    // The class_subjects rows are NOT deleted when the teacher leaves the subject
    // pool — the client is warned and can reassign/clean those separately.
    async isTeacherTeachingSubjectInClass(subjectId: number, teacherId: number): Promise<boolean> {
        try {
            const query = `
                SELECT cs.id
                FROM class_subjects cs
                WHERE cs.subjectId = ? AND cs.teacherId = ?
                LIMIT 1
            `;
            const [rows] = await this.connection.execute<RowDataPacket[]>(query, [subjectId, teacherId]);
            return rows.length > 0;
        } catch (err) {
            throw new InternalServerError("Failed to check teacher class assignments", 500, err);
        }
    }

    // Remove a teacher from a subject's teacher pool (teacher_subject_assignment).
    // Returns the number of rows deleted so the service can 404 when nothing matched.
    async unassignTeacherFromSubject(subjectId: number, teacherId: number): Promise<number> {
        try {
            const query = "DELETE FROM teacher_subject_assignment WHERE subjectId = ? AND teacherId = ?";
            const [result] = await this.connection.execute<ResultSetHeader>(query, [subjectId, teacherId]);
            return result.affectedRows;
        } catch (err) {
            throw new InternalServerError("Failed to remove teacher from subject", 500, err);
        }
    }

    // get subjects assigned with assigned teachers but not asssigned to this this class
    async getSubjectsWithAssignedTeachersNotInClass(classId: number, subjectId: number): Promise<SubjectWithTeachersNotAssignedToClass[]> {
        try {
            const query = `
                SELECT 
                    s.id AS subjectId,
                    s.name AS subjectName,
                    s.code AS subjectCode,
                    s.unit AS subjectUnit,
                    t.id AS teacherId,
                    CONCAT_WS(" ", t.firstname, t.middlename, t.lastname, IF(t.suffix IS NOT NULL, CONCAT(" ", t.suffix), "")) AS teacherFullname
                FROM 
                    teachers t
                JOIN 
                    teacher_subject_assignment tsa ON t.id = tsa.teacherId
                JOIN 
                    subjects s ON tsa.subjectId = s.id
                WHERE tsa.subjectId = ? 
                AND t.id NOT IN (
                    SELECT 
                        cs.teacherId
                        FROM 
                        class_subjects cs
                        WHERE cs.classId = ? AND cs.subjectId = ?
                )
            `;

            const [rows] = await this.connection.execute<RowDataPacket[]>(query, [ subjectId, classId, subjectId]);
            return rows as SubjectWithTeachersNotAssignedToClass[];
        } catch (err) {
            throw new InternalServerError("Failed to fetch subjects with assigned teachers not in class", 500, err);
        }
    }

    // get Subjects with teachers that are not assigned to this classroom
    async getSubjectsNotInClass(classId: number): Promise<SubjectWithTeachersNotAssignedToClass[]> {
        try {
            const query = `
                SELECT 
                s.id AS subjectId,
                s.name AS subjectName,
                s.code AS subjectCode,
                s.unit AS subjectUnit,
                t.id AS teacherId,
                CONCAT_WS(" ", t.firstname, t.middlename, t.lastname, IF(t.suffix IS NOT NULL, CONCAT(" ", t.suffix), "")) AS teacherFullname
                FROM 
                    subjects s
                JOIN 
                    teacher_subject_assignment tsa ON s.id = tsa.subjectId
                JOIN 
                    teachers t ON tsa.teacherId = t.id
                WHERE s.id NOT IN (
                    SELECT cs.subjectId
                    FROM class_subjects cs
                    WHERE cs.classId = ?
                )
                ORDER BY s.id
            `;

            const [rows] = await this.connection.execute<RowDataPacket[]>(query, [classId]);
            return rows as SubjectWithTeachersNotAssignedToClass[];
        } catch (err) {
            throw new InternalServerError("Failed to fetch subjects not in class", 500, err);
        }
    }
}
