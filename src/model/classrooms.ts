import {PoolConnection} from "mysql2/promise";
import type{ResultSetHeader, RowDataPacket} from "mysql2/promise";
import { InternalServerError } from "../middleware/errors.js";

import type {ClassroomResponse, ClassroomTeachersWithSubjectProps, NewClassroomSubject} from "../constant/classrooms.js";

export default class Classroom {
    constructor(private connection: PoolConnection) {}

    // Create a new classroom
    async createClassroom(classroom: Omit<ClassroomResponse, "id">): Promise<number> {
        const {gradeLevel, section} = classroom;
        try {
            const query = `
                INSERT INTO classrooms (section, gradeLevel)
                VALUES (?, ?)
            `;

            const values = [section, gradeLevel];

            const [result] = await this.connection.execute<ResultSetHeader>(query, values);
            
            return result.insertId;
        }catch(err) {
            throw new InternalServerError("Failed to create classroom", 500, err);
        }
    }

    // Get all classrooms
    async getAllClassrooms():Promise<ClassroomResponse[]> {
        try {
            const query = `
            SELECT 
            c.id,
            c.section,
            c.gradeLevel,
            COUNT(s.id) AS totalStudent,
            -- Class adviser (class_teacher holds at most one adviser per class)
            t.id AS adviserId,
            CONCAT_WS(" ", t.firstname, t.middlename, t.lastname, IF(t.suffix IS NOT NULL, CONCAT(" ", t.suffix), "")) AS adviserFullname
            FROM  
            classrooms c
            LEFT JOIN class_teacher ct ON ct.classId = c.id
            LEFT JOIN teachers t ON t.id = ct.teacherId
            LEFT JOIN class_students cst ON cst.classId = c.id
            LEFT JOIN enrollments e ON e.id = cst.enrollmentId AND e.status = 'enrolled'
            -- Status filter lives in the JOIN so classrooms with only
            -- soft-deleted students still appear (with a count of 0).
            LEFT JOIN students s ON s.id = e.studentId
                AND (s.status IS NULL OR s.status <> "inactive")
            -- Archived classes are hidden from the list (soft delete — see
            -- docs/classroom-subject-management.md).
            WHERE c.status IS NULL OR c.status <> 'inactive'
            GROUP BY c.id, t.id
        `

        const [rows] = await this.connection.execute<RowDataPacket[]>(query);
        return rows as ClassroomResponse[];
        }catch(err) {
            throw new InternalServerError("Failed to fetch classrooms", 500, err);
        }
    }

    // Get the class adviser for a classroom (null when unassigned)
    async getClassAdviser(classId: number): Promise<{ adviserId: number | null; adviserFullname: string | null } | null> {
        try {
            const query = `
                SELECT
                    t.id AS adviserId,
                    CONCAT_WS(" ", t.firstname, t.middlename, t.lastname, IF(t.suffix IS NOT NULL, CONCAT(" ", t.suffix), "")) AS adviserFullname
                FROM class_teacher ct
                LEFT JOIN teachers t ON t.id = ct.teacherId
                WHERE ct.classId = ?
                LIMIT 1
            `;
            const [rows] = await this.connection.execute<RowDataPacket[]>(query, [classId]);
            if (rows.length === 0 || rows[0] === undefined) {
                return { adviserId: null, adviserFullname: null };
            }
            return rows[0] as { adviserId: number | null; adviserFullname: string | null };
        } catch (err) {
            throw new InternalServerError("Failed to fetch class adviser", 500, err);
        }
    }

    // The classroom id a teacher currently advises (for the one-class-per-teacher rule).
    // Legacy data could theoretically hold rows for several classes; any assignment
    // still blocks assigning this teacher elsewhere (all writes go through
    // setClassAdviser, which deletes the class rows first, so no new dupes arise).
    async getClassIdByAdviser(teacherId: number): Promise<number | null> {
        try {
            const query = "SELECT classId FROM class_teacher WHERE teacherId = ? LIMIT 2";
            const [rows] = await this.connection.execute<RowDataPacket[]>(query, [teacherId]);
            if (rows.length === 0 || rows[0] === undefined) {
                return null;
            }
            const first = Number(rows[0].classId);
            if (rows.length > 1 && rows[1] !== undefined && Number(rows[1].classId) !== first) {
                throw new InternalServerError("Teacher has duplicate adviser assignments across multiple classes", 500);
            }
            return first;
        } catch (err) {
            if (err instanceof InternalServerError) {
                throw err;
            }
            throw new InternalServerError("Failed to fetch adviser assignment", 500, err);
        }
    }

    // Assign (or reassign) the class adviser for a classroom.
    // The class_teacher table has no unique constraint on classId, so any
    // existing rows for this class are removed first — this keeps the
    // one-adviser-per-class rule enforced here in the application.
    async setClassAdviser(classId: number, teacherId: number | null): Promise<void> {
        try {
            await this.connection.execute("DELETE FROM class_teacher WHERE classId = ?", [classId]);
            if (teacherId !== null) {
                const query = "INSERT INTO class_teacher (classId, teacherId) VALUES (?, ?)";
                await this.connection.execute<ResultSetHeader>(query, [classId, teacherId]);
            }
        } catch (err) {
            throw new InternalServerError("Failed to assign class adviser", 500, err);
        }
    }

    // Get classroom by ID
    async getClassroomById(id: number): Promise<ClassroomResponse | null> {
       try {
            const query = `
                SELECT 
                * 
                FROM 
                classrooms
                WHERE id = ?
            `; 

            const [rows] = await this.connection.execute<RowDataPacket[]>(query, [id]);
            if (rows.length === 0) {
                return null;
            }
            return rows[0] as ClassroomResponse;
       }catch(err) {
            throw new InternalServerError("Failed to fetch classroom", 500, err);
        }
    }

    // Get classroom by section and grade level
    async getClassroomBySectionAndGradeLevel(section: string, gradeLevel: string): Promise<ClassroomResponse | null> {
        try {
            const query = `
                SELECT 
                * 
                FROM 
                classrooms
                WHERE section = ? AND gradeLevel = ?
            `; 
            const [rows] = await this.connection.execute<RowDataPacket[]>(query, [section, gradeLevel]);
            if (rows.length === 0) {
                return null;
            }
            return rows[0] as ClassroomResponse;
        }catch(err) {
            throw new InternalServerError("Failed to fetch classroom", 500, err);
        }
    }

    // Duplicate check for edits: same section + gradeLevel, but NOT the row being edited.
    async getClassroomBySectionAndGradeLevelExcluding(section: string, gradeLevel: string, excludeId: number): Promise<ClassroomResponse | null> {
        try {
            const query = `
                SELECT
                *
                FROM
                classrooms
                WHERE section = ? AND gradeLevel = ? AND id <> ?
                LIMIT 1
            `;
            const [rows] = await this.connection.execute<RowDataPacket[]>(query, [section, gradeLevel, excludeId]);
            if (rows.length === 0) {
                return null;
            }
            return rows[0] as ClassroomResponse;
        } catch (err) {
            throw new InternalServerError("Failed to fetch classroom", 500, err);
        }
    }

    // Update a classroom's section + grade level. Returns affected rows (0 when the id is missing).
    async updateClassroom(id: number, data: { section: string; gradeLevel: string | number }): Promise<number> {
        try {
            const query = `
                UPDATE classrooms
                SET section = ?, gradeLevel = ?
                WHERE id = ?
            `;
            const [result] = await this.connection.execute<ResultSetHeader>(query, [data.section, data.gradeLevel, id]);
            return result.affectedRows;
        } catch (err) {
            throw new InternalServerError("Failed to update classroom", 500, err);
        }
    }

    // Soft delete: flip status to inactive. Returns affected rows (0 when already archived or missing).
    async archiveClassroom(id: number): Promise<number> {
        try {
            const query = `
                UPDATE classrooms
                SET status = 'inactive'
                WHERE id = ? AND (status IS NULL OR status <> 'inactive')
            `;
            const [result] = await this.connection.execute<ResultSetHeader>(query, [id]);
            return result.affectedRows;
        } catch (err) {
            throw new InternalServerError("Failed to archive classroom", 500, err);
        }
    }

    // Active-school-year enrollment count (used to gate archiving).
    async getActiveYearEnrollmentCount(classId: number): Promise<number> {
        try {
            const query = `
                SELECT COUNT(*) AS cnt
                FROM enrollments e
                JOIN schoolyear sy ON sy.id = e.schoolYearId
                JOIN students s ON s.id = e.studentId AND (s.status IS NULL OR s.status <> 'inactive')
                WHERE e.classId = ? AND sy.isActive = 1 AND e.status = 'enrolled'
            `;
            const [rows] = await this.connection.execute<RowDataPacket[]>(query, [classId]);
            return Number(rows[0]?.cnt ?? 0);
        } catch (err) {
            throw new InternalServerError("Failed to count classroom enrollments", 500, err);
        }
    }

    // Remove the adviser assignment(s) for a class (frees the teacher when archiving).
    async clearClassAdviserAssignment(classId: number): Promise<void> {
        try {
            await this.connection.execute("DELETE FROM class_teacher WHERE classId = ?", [classId]);
        } catch (err) {
            throw new InternalServerError("Failed to clear class adviser", 500, err);
        }
    }

    // Get all teachers assigned to a specific classroom along with their subjects
    async getClassroomTeachersWithSubject(classroomId: number): Promise<ClassroomTeachersWithSubjectProps[]> {
        try {
            const query = `
                SELECT 
                    t.id AS teacherId,
                    s.code,
                    s.unit,
                    CONCAT_WS(" ", t.firstname, t.middlename, t.lastname, IF(t.suffix IS NOT NULL, CONCAT(" ", t.suffix), "")) AS teacherFullname,
                    s.id AS subjectId,
                    s.name AS subjectName
                FROM 
                    class_subjects cs
                JOIN 
                    teachers t ON cs.teacherId = t.id
                JOIN 
                    subjects s ON cs.subjectId = s.id
                WHERE 
                    cs.classId = ?
            `;

            const [rows] = await this.connection.execute<RowDataPacket[]>(query, [classroomId]);
            return rows as ClassroomTeachersWithSubjectProps[];
        }catch(err) {
            throw new InternalServerError("Failed to fetch classroom teachers with subjects", 500, err);
        }
    }
}

