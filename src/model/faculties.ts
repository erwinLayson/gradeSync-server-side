import {PoolConnection} from "mysql2/promise";
import type{ResultSetHeader, RowDataPacket} from "mysql2/promise";
// Error Handling
import { InternalServerError } from "../middleware/errors.js";
// Types constant
import type { FacultyProps, FacultyResponse, FacultyDetails, FacultyUpdateProps, FacultySubjectDetails, FacultyRole } from "../constant/faculties.js";

export default class Faculty {
    constructor(private connection: PoolConnection) {}

    // Create a new faculty
    async createFaculty(faculty: FacultyProps): Promise<number> {
        const {userId, email, firstname, middlename, lastname, suffix, role} = faculty;
        try {
            const query = `INSERT INTO faculties (userId, email, firstname, middlename, lastname, suffix, role) VALUES (?, ?, ?, ?, ?, ?, ?)`;

            const values = [userId, email, firstname, middlename, lastname, suffix ?? null, role];
            const [result] = await this.connection.execute<ResultSetHeader>(query, values);
            return result.insertId;
        }catch(err) {
            throw new InternalServerError("Failed to create faculty", 500, err);
        } 
    }

    // Get all faculties. `role` narrows the list to one faculty role — used by
    // the assignment pickers (GET /faculties?role=teacher), which must never
    // offer a register faculty member for a teaching duty.
    async getAllFaculties(role?: FacultyRole): Promise<FacultyResponse[]> {
        try {
            const where = role ? " WHERE role = ?" : "";
            const query = `
            SELECT 
            id,
            role,
            email,
            CONCAT(firstname, ' ', middlename, ' ', lastname, IF(suffix IS NOT NULL, CONCAT(' ', suffix), '')) AS fullname
            FROM faculties${where}`;
            const [rows] = await this.connection.execute<RowDataPacket[]>(query, role ? [role] : []);
            return rows as FacultyResponse[];
        }catch(err) {
            throw new InternalServerError("Failed to get all faculties", 500, err);
        }
    }

    // Get faculty by user ID
    async getFacultyByUserId(userId: number): Promise<FacultyDetails | null> {
        try {
            const query = `
            SELECT 
            id,
            userId,
            role,
            email,
            firstname,
            middlename,
            lastname,
            suffix,
            CONCAT(firstname, ' ', middlename, ' ', lastname, IF(suffix IS NOT NULL, CONCAT(' ', suffix), '')) AS fullname
            FROM faculties WHERE userId = ?`;
            const [rows] = await this.connection.execute<RowDataPacket[]>(query, [userId]);
            if (rows.length === 0) {
                return null;
            }
            const faculty = rows[0] as FacultyDetails;
            return faculty;
        }catch(err) {
            throw new InternalServerError("Failed to get faculty by user ID", 500, err);
        }
    }

    // Get faculty by ID
    async getFacultyById(facultyId: number): Promise<FacultyDetails | null> {
        try {
            const query = `
            SELECT 
            id,
            userId,
            role,
            email,
            firstname,
            middlename,
            lastname,
            suffix,
            CONCAT(firstname, ' ', middlename, ' ', lastname, IF(suffix IS NOT NULL, CONCAT(' ', suffix), '')) AS fullname
            FROM faculties WHERE id = ?`;
            const [rows] = await this.connection.execute<RowDataPacket[]>(query, [facultyId]);
            if (rows.length === 0) {
                return null;
            }
            const faculty = rows[0] as FacultyDetails;
            return faculty;
        }catch(err) {
            throw new InternalServerError("Failed to get faculty by ID", 500, err);
        }
    }

    // Count class-adviser assignments for a faculty (class_adviser is ON DELETE RESTRICT)
    async getClassFacultyAssignmentCount(facultyId: number): Promise<number> {
        try {
            const query = "SELECT COUNT(*) AS count FROM class_adviser WHERE facultyId = ?";
            const [rows] = await this.connection.execute<RowDataPacket[]>(query, [facultyId]);
            return Number((rows[0] as { count: number }).count);
        }catch(err) {
            throw new InternalServerError("Failed to check faculty assignments", 500, err);
        }
    }

    // Count class-subject (teaching) assignments held by a faculty member.
    // Used by the teacher -> register transition: live teaching work must be
    // cleared before a faculty member may stop being a teacher.
    async getClassSubjectAssignmentCount(facultyId: number): Promise<number> {
        try {
            const query = "SELECT COUNT(*) AS count FROM class_subjects WHERE facultyId = ?";
            const [rows] = await this.connection.execute<RowDataPacket[]>(query, [facultyId]);
            return Number((rows[0] as { count: number }).count);
        }catch(err) {
            throw new InternalServerError("Failed to check faculty teaching assignments", 500, err);
        }
    }

    // Drop a faculty member's subject-teaching *eligibility* rows.
    // faculty_subject_assignment is a capability, not a historical record, so it
    // is removed atomically with the role change (frozen grades are snapshots
    // and are never touched).
    async clearSubjectAssignments(facultyId: number): Promise<void> {
        try {
            const query = "DELETE FROM faculty_subject_assignment WHERE facultyId = ?";
            await this.connection.execute<ResultSetHeader>(query, [facultyId]);
        }catch(err) {
            throw new InternalServerError("Failed to clear faculty subject assignments", 500, err);
        }
    }

    // Delete faculty by ID
    async deleteFaculty(facultyId: number): Promise<void> {
        try {
            const query = "DELETE FROM faculties WHERE id = ?";
            await this.connection.execute<ResultSetHeader>(query, [facultyId]);
        }catch(err) {
            throw new InternalServerError("Failed to delete faculty", 500, err);
        }
    }

    // Update faculty by ID
    async updateFaculty(facultyId: number, faculty: FacultyUpdateProps): Promise<void> {
        const updateFields: string[] = [];
        const values: (string | null)[] = [];

        for (const field of ["email", "firstname", "middlename", "lastname", "suffix", "role"] as const) {
            if (field in faculty) {
                updateFields.push(`${field} = ?`);
                values.push((faculty as Record<string, string | null | undefined>)[field] ?? null);
            }
        }

        if (updateFields.length === 0) {
            return;
        }

        try {
            const query = `
            UPDATE faculties
            SET ${updateFields.join(", ")}
            WHERE id = ?`;
            await this.connection.execute<ResultSetHeader>(query, [...values, facultyId]);
        }catch(err) {
            throw new InternalServerError("Failed to update faculty", 500, err);
        }
    }


    // Get faculty by email
    async getFacultyByEmail(email: string): Promise<FacultyResponse | null> {
        try {
            const query = `
            SELECT 
            id,
            role,
            email,
            CONCAT(firstname, ' ', middlename, ' ', lastname, IF(suffix IS NOT NULL, CONCAT(' ', suffix), '')) AS fullname
            FROM faculties WHERE email = ?`;
            const [rows] = await this.connection.execute<RowDataPacket[]>(query, [email]);
            if (rows.length === 0) {
                return null;
            }
            const faculty = rows[0] as FacultyResponse;
            return faculty;
        }catch(err) {
            throw new InternalServerError("Failed to get faculty by email", 500, err);
        }
    }


    async getFacultiesBySubjectId(subjectId: number): Promise<FacultyResponse[]> {
        try {
            const query = `
                SELECT 
                t.id,
                t.role,
                t.email,
                CONCAT(t.firstname, ' ', t.middlename, ' ', t.lastname, IF(t.suffix IS NOT NULL, CONCAT(' ', t.suffix), '')) AS fullname
                FROM faculty_subject_assignment tsa
                JOIN faculties t 
                ON tsa.facultyId = t.id
                WHERE tsa.subjectId = ?
            `;
            const [rows] = await this.connection.execute<RowDataPacket[]>(query, [subjectId]);
            return rows as FacultyResponse[];
        } catch (err) {
            throw new InternalServerError("Failed to get faculties by subject ID", 500, err);
        }
    }

    // Get faculty subject details by faculties ID
    async getFacultySubjectDetailsFacultyByIdService(facultyId: number): Promise<FacultySubjectDetails[] | null> {
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
                FROM faculties t
                JOIN class_subjects cs ON cs.facultyId = t.id
                JOIN subjects s ON cs.subjectId = s.id
                LEFT JOIN classrooms c ON c.id = cs.classId
                WHERE t.id = ?
            `;
            const [rows] = await this.connection.execute<RowDataPacket[]>(query, [facultyId]);
            if (rows.length === 0) {
                return null;
            }
            const faculty = rows as FacultySubjectDetails[];
            return faculty;
        } catch (err) {
            throw new InternalServerError("Failed to get faculty details by ID", 500, err);
        }
    }
}