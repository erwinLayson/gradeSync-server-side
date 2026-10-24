import {PoolConnection} from "mysql2/promise";
import type{ResultSetHeader, RowDataPacket} from "mysql2/promise";
import { InternalServerError } from "../middleware/errors.js";

import type {Subject, AssignFacultyProps, SubjectWithFacultiesNotAssignedToClass} from "../constant/subjects.js";
import type{FacultyResponse} from "../constant/faculties.js";

export default class Subjects {
    constructor(private connection: PoolConnection) {}

    // Create a new subject
    async createSubject(subject: Omit<Subject, "id">): Promise<number> {
        const {name, code, unit, hasComponents} = subject;
        try {
            const query = `
                INSERT INTO subjects (name, code, unit, hasComponents)
                VALUES (?, ?, ?, ?)
            `;

            const values = [name, code, unit, hasComponents ? 1 : 0];

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
    async updateSubject(id: number, data: { name: string; code: string; unit: number | null }): Promise<number> {
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
    // faculty pool / enrollment rows. Frozen student records no longer count:
    // they keep their own name/code snapshot (migration step 12), so a subject
    // frozen in old records can be deleted safely (see docs/classroom-subject-management.md).
    async getSubjectUsage(subjectId: number): Promise<{ classes: number; faculties: number; enrollments: number }> {
        try {
            const [rows] = await this.connection.execute<RowDataPacket[]>(
                `
                SELECT
                    (SELECT COUNT(*) FROM class_subjects WHERE subjectId = ?) AS classes,
                    (SELECT COUNT(*) FROM faculty_subject_assignment WHERE subjectId = ?) AS faculties,
                    (SELECT COUNT(*) FROM enrollment_details WHERE subjectId = ?) AS enrollments
                `,
                [subjectId, subjectId, subjectId]
            );
            const row = rows[0] as { classes?: unknown; faculties?: unknown; enrollments?: unknown } | undefined;
            return {
                classes: Number(row?.classes ?? 0),
                faculties: Number(row?.faculties ?? 0),
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

    // Get faculties Unassigned to a specific subject
    // Candidate pool for "assign a faculty to this subject". Register faculty
    // are filtered out HERE (server-side), so they can never be offered as a
    // teaching candidate even if the client renders its own list (plan §6.2).
    async getFacultiesUnassignedToSubject(subjectId: number): Promise<Omit<FacultyResponse, "userId">[]> {
        try {
            const query = `
                SELECT 
                    t.id,
                    t.role,
                    CONCAT_WS(" ", t.firstname, t.middlename, t.lastname, IF(t.suffix IS NOT NULL, CONCAT(" ", t.suffix), "")) AS fullname,
                    t.email
                FROM 
                    faculties t
                WHERE 
                    t.role = 'teacher'
                    AND t.id NOT IN (
                        SELECT 
                            tsa.facultyId
                        FROM 
                            faculty_subject_assignment tsa
                        WHERE 
                            tsa.subjectId = ?
                    )
            `;

            const [rows] = await this.connection.execute<RowDataPacket[]>(query, [subjectId]);
            return rows as any[];
        } catch (err) {
            throw new InternalServerError("Failed to fetch unassigned faculties", 500, err);
        }
    }

    // Assign faculties to a specific subject
    async assignFacultiesToSubject({subjectId, facultiesId}: AssignFacultyProps): Promise<void> {
        try {
            const query = `
                INSERT INTO faculty_subject_assignment (subjectId, facultyId)
                VALUES (?, ?)
            `;

            for (const facultyId of facultiesId) {
                await this.connection.execute(query, [subjectId, facultyId]);
            }
        } catch (err) {
            throw new InternalServerError("Failed to assign faculties to subject", 500, err);
        }
    }

    // Whether the faculty still teaches this subject in an active class assignment.
    // The class_subjects rows are NOT deleted when the faculty leaves the subject
    // pool — the client is warned and can reassign/clean those separately.
    async isFacultyTeachingSubjectInClass(subjectId: number, facultyId: number): Promise<boolean> {
        try {
            const query = `
                SELECT cs.id
                FROM class_subjects cs
                WHERE cs.subjectId = ? AND cs.facultyId = ?
                LIMIT 1
            `;
            const [rows] = await this.connection.execute<RowDataPacket[]>(query, [subjectId, facultyId]);
            return rows.length > 0;
        } catch (err) {
            throw new InternalServerError("Failed to check faculty class assignments", 500, err);
        }
    }

    // Remove a faculty from a subject's faculty pool (faculty_subject_assignment).
    // Returns the number of rows deleted so the service can 404 when nothing matched.
    async unassignFacultyFromSubject(subjectId: number, facultyId: number): Promise<number> {
        try {
            const query = "DELETE FROM faculty_subject_assignment WHERE subjectId = ? AND facultyId = ?";
            const [result] = await this.connection.execute<ResultSetHeader>(query, [subjectId, facultyId]);
            return result.affectedRows;
        } catch (err) {
            throw new InternalServerError("Failed to remove faculty from subject", 500, err);
        }
    }

    // get subjects assigned with assigned faculties but not asssigned to this this class
    async getSubjectsWithAssignedFacultiesNotInClass(classId: number, subjectId: number): Promise<SubjectWithFacultiesNotAssignedToClass[]> {
        try {
            const query = `
                SELECT 
                    s.id AS subjectId,
                    s.name AS subjectName,
                    s.code AS subjectCode,
                    s.unit AS subjectUnit,
                    t.id AS facultyId,
                    CONCAT_WS(" ", t.firstname, t.middlename, t.lastname, IF(t.suffix IS NOT NULL, CONCAT(" ", t.suffix), "")) AS facultyFullname
                FROM 
                    faculties t
                JOIN 
                    faculty_subject_assignment tsa ON t.id = tsa.facultyId
                JOIN 
                    subjects s ON tsa.subjectId = s.id
                WHERE tsa.subjectId = ? 
                AND t.id NOT IN (
                    SELECT 
                        cs.facultyId
                        FROM 
                        class_subjects cs
                        WHERE cs.classId = ? AND cs.subjectId = ?
                )
            `;

            const [rows] = await this.connection.execute<RowDataPacket[]>(query, [ subjectId, classId, subjectId]);
            return rows as SubjectWithFacultiesNotAssignedToClass[];
        } catch (err) {
            throw new InternalServerError("Failed to fetch subjects with assigned faculties not in class", 500, err);
        }
    }

    // get Subjects with faculties that are not assigned to this classroom
    async getSubjectsNotInClass(classId: number): Promise<SubjectWithFacultiesNotAssignedToClass[]> {
        try {
            const query = `
                SELECT 
                s.id AS subjectId,
                s.name AS subjectName,
                s.code AS subjectCode,
                s.unit AS subjectUnit,
                t.id AS facultyId,
                CONCAT_WS(" ", t.firstname, t.middlename, t.lastname, IF(t.suffix IS NOT NULL, CONCAT(" ", t.suffix), "")) AS facultyFullname
                FROM 
                    subjects s
                JOIN 
                    faculty_subject_assignment tsa ON s.id = tsa.subjectId
                JOIN 
                    faculties t ON tsa.facultyId = t.id
                WHERE s.id NOT IN (
                    SELECT cs.subjectId
                    FROM class_subjects cs
                    WHERE cs.classId = ?
                )
                ORDER BY s.id
            `;

            const [rows] = await this.connection.execute<RowDataPacket[]>(query, [classId]);
            return rows as SubjectWithFacultiesNotAssignedToClass[];
        } catch (err) {
            throw new InternalServerError("Failed to fetch subjects not in class", 500, err);
        }
    }
}
