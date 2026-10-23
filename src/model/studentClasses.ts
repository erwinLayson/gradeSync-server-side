import { PoolConnection, type RowDataPacket } from "mysql2/promise";

// Error
import { InternalServerError } from "../middleware/errors.js";

// Row shapes returned by this model
export interface StudentEnrollmentRow {
    enrollmentId: number;
    classId: number;
    schoolYearId: number;
    startYear: string;
    endYear: string;
    isActive?: number | boolean;
}

export interface ClassWithAdviserRow {
    id: number;
    section: string;
    gradeLevel: number;
    adviserId: number | null;
    adviserFullname: string | null;
}

export interface ClassSubjectRow {
    classSubjectId: number;
    subjectId: number;
    name: string;
    code: string;
    unit: number | null;
    facultyId: number;
    facultyFullname: string;
}

export default class StudentClassesModel {
    constructor(private connection: PoolConnection) {}

    // Resolve the student row belonging to a login account (students.userId).
    async getStudentIdByUserId(userId: number): Promise<number | null> {
        try {
            const query = "SELECT id FROM students WHERE userId = ? LIMIT 1";
            const [rows] = await this.connection.execute<RowDataPacket[]>(query, [userId]);
            const row = rows[0];
            return row !== undefined ? Number(row.id) : null;
        } catch (err) {
            throw new InternalServerError("Failed to resolve student record", 500, err);
        }
    }

    // Every enrollment of the student (all school years), newest first.
    //
    // History readers use this, so it must include 'completed' enrollments
    // (audit F-2): a year that has been cleared at semester end is finished
    // history, not a deleted year. Filtering to 'enrolled' only made a cleared
    // school year vanish from the prospectus / academic-history views even
    // though its frozen record was intact (the SF10 PDF, which uses a separate
    // unfiltered query, still showed it). Active-roster queries elsewhere keep
    // their own `status = 'enrolled'` restriction — this is the history reader
    // only, and 'unenrolled'/'dropped' years remain excluded.
    async getEnrollmentsByStudentId(studentId: number): Promise<StudentEnrollmentRow[]> {
        try {
            const query = `
                SELECT e.id AS enrollmentId, e.classId, e.schoolYearId,
                       sy.startYear, sy.endYear, sy.isActive
                FROM enrollments e
                JOIN schoolyear sy ON sy.id = e.schoolYearId
                WHERE e.studentId = ? AND e.status IN ('enrolled', 'completed')
                ORDER BY e.schoolYearId DESC
            `;
            const [rows] = await this.connection.execute<RowDataPacket[]>(query, [studentId]);
            return rows as StudentEnrollmentRow[];
        } catch (err) {
            throw new InternalServerError("Failed to fetch enrollments", 500, err);
        }
    }

    // Section + grade level + adviser (class_adviser holds at most one per class).
    async getClassWithAdviser(classId: number): Promise<ClassWithAdviserRow | null> {
        try {
            const query = `
                SELECT c.id, c.section, c.gradeLevel,
                       t.id AS adviserId,
                       CONCAT_WS(" ", t.firstname, t.middlename, t.lastname,
                                 IF(t.suffix IS NOT NULL, CONCAT(" ", t.suffix), "")) AS adviserFullname
                FROM classrooms c
                LEFT JOIN class_adviser ct ON ct.classId = c.id
                LEFT JOIN faculties t ON t.id = ct.facultyId
                WHERE c.id = ?
                LIMIT 1
            `;
            const [rows] = await this.connection.execute<RowDataPacket[]>(query, [classId]);
            const row = rows[0];
            if (row === undefined) {
                return null;
            }
            return {
                id: Number(row.id),
                section: row.section,
                gradeLevel: Number(row.gradeLevel),
                adviserId: row.adviserId !== null && row.adviserId !== undefined ? Number(row.adviserId) : null,
                adviserFullname: row.adviserFullname ?? null
            };
        } catch (err) {
            throw new InternalServerError("Failed to fetch classroom", 500, err);
        }
    }

    // Subjects + faculties assigned to a class.
    async getClassSubjectsByClassId(classId: number): Promise<ClassSubjectRow[]> {
        try {
            const query = `
                SELECT cs.id AS classSubjectId, cs.subjectId,
                       s.name, s.code, s.unit,
                       t.id AS facultyId,
                       CONCAT_WS(" ", t.firstname, t.middlename, t.lastname,
                                 IF(t.suffix IS NOT NULL, CONCAT(" ", t.suffix), "")) AS facultyFullname
                FROM class_subjects cs
                JOIN subjects s ON s.id = cs.subjectId
                JOIN faculties t ON t.id = cs.facultyId
                WHERE cs.classId = ?
                ORDER BY s.name
            `;
            const [rows] = await this.connection.execute<RowDataPacket[]>(query, [classId]);
            return rows as ClassSubjectRow[];
        } catch (err) {
            throw new InternalServerError("Failed to fetch class subjects", 500, err);
        }
    }
}
