import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";

// Error
import { InternalServerError, NotFoundError } from "../middleware/errors.js";

// Types
import type{
    StudentCreateProps, 
    StudentResponseProps, 
    StudentWithClassroom,
    StudentListQuery
} from "../constant/students.js";

import { AllowedStudentFields } from "../constant/students.js";

export default class Students {
    constructor(private connection: PoolConnection) {}

    // Create new Students
    async createStudents(student: StudentCreateProps):Promise<number> {
        const {
            userId, 
            lrn, 
            email, 
            firstname, 
            middlename,
            lastname, 
            suffix, 
            birthdate, 
            sex
        } = student
        try {
            const query = "INSERT INTO students(userId, lrn, email, firstname, middlename, lastname, suffix, birthdate, sex, status) VALUES(?,?,?,?,?,?,?,?,?,?)"

            const values = [
                userId ?? null,
                lrn,
                email,
                firstname,
                middlename,
                lastname,
                suffix ?? null,
                birthdate,
                sex,
                "active"
            ]
            const [result] = await this.connection.execute<ResultSetHeader>(query, values);
            return result.insertId
        }catch(err) {
            throw new InternalServerError("Internal Server Error", 500, err);
        }
    }

    // Get all students
    async getAllStudent():Promise<StudentResponseProps[]> {
        try {
            const query = `
                SELECT 
                id,
                lrn,
                email,
                firstname,
                middlename,
                lastname,
                suffix,
                CONCAT(firstname, ' ', middlename, ' ', lastname, IF(suffix IS NOT NULL, CONCAT(' ', suffix), '')) AS fullname,
                birthdate,
                TIMESTAMPDIFF(YEAR, birthdate, CURDATE()) AS age,
                sex,
                status
                FROM
                students
                -- All records are returned (including inactive/soft-deleted ones);
                -- the client decides whether to hide inactive rows based on filters.
            `;

            const [result] = await this.connection.execute<RowDataPacket[]>(query);

            return result as StudentResponseProps[]
        }catch(err) {
            throw new InternalServerError("Internal Server Error", 500, err);
        }
    }

    // Paginated / searchable / filterable / sortable student registry.
    // Only the requested page of rows is ever read from the database.
    async getStudentsPage(query: StudentListQuery): Promise<{ students: StudentResponseProps[]; total: number }> {
        // WHERE fragments are built from fixed strings; only values are bound.
        const where: string[] = [];
        const params: (string | number)[] = [];

        const search = query.search?.trim();
        if (search) {
            const like = `%${search}%`;
            where.push(
                "(CONCAT_WS(' ', s.firstname, s.middlename, s.lastname, s.suffix) LIKE ? OR s.lrn LIKE ? OR s.email LIKE ?)"
            );
            params.push(like, like, like);
        }

        if (query.status === "active") {
            where.push("(s.status IS NULL OR s.status = 'active')");
        } else if (query.status === "inactive") {
            where.push("s.status = 'inactive'");
        }
        // status === "all" adds no predicate.

        if (query.classId) {
            where.push(
                "EXISTS (SELECT 1 FROM enrollments e WHERE e.studentId = s.id AND e.classId = ? AND e.status = 'enrolled')"
            );
            params.push(query.classId);
        }

        const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

        // Whitelist the sort column so nothing user-supplied reaches the SQL text.
        const sortColumn: Record<StudentListQuery["sort"], string> = {
            name: "fullname",
            lrn: "s.lrn",
            email: "s.email",
            id: "s.id"
        };
        const dir = query.dir === "desc" ? "DESC" : "ASC";
        // pageSize/page are already clamped to positive integers by the service,
        // so inlining them for LIMIT/OFFSET is safe (MySQL rejects bound LIMITs
        // in some configurations).
        const offset = (query.page - 1) * query.pageSize;

        try {
            const [countRows] = await this.connection.execute<RowDataPacket[]>(
                `SELECT COUNT(*) AS total FROM students s ${whereSql}`,
                params
            );
            const total = Number(countRows[0]?.total ?? 0);

            const [rows] = await this.connection.execute<RowDataPacket[]>(
                `
                SELECT 
                s.id,
                s.lrn,
                s.email,
                s.firstname,
                s.middlename,
                s.lastname,
                s.suffix,
                CONCAT(s.firstname, ' ', s.middlename, ' ', s.lastname, IF(s.suffix IS NOT NULL, CONCAT(' ', s.suffix), '')) AS fullname,
                s.birthdate,
                TIMESTAMPDIFF(YEAR, s.birthdate, CURDATE()) AS age,
                s.sex,
                s.status
                FROM students s
                ${whereSql}
                ORDER BY ${sortColumn[query.sort]} ${dir}, s.id ASC
                LIMIT ${query.pageSize} OFFSET ${offset}
                `,
                params
            );

            return { students: rows as StudentResponseProps[], total };
        } catch (err) {
            throw new InternalServerError("Internal Server Error", 500, err);
        }
    }
    // Get student by ID
    async getStudentById(id: number):Promise<StudentResponseProps | null> {
        try {
            const query = `
                SELECT 
                s.*,
                CONCAT(s.firstname, ' ', s.middlename, ' ', s.lastname, IF(s.suffix IS NOT NULL, CONCAT(' ', s.suffix), '')) AS fullname,
                TIMESTAMPDIFF(YEAR, s.birthdate, CURDATE()) AS age
                FROM
                students s
                WHERE s.id = ?
            `;

            const [result] = await this.connection.execute<RowDataPacket[]>(query, [id]);

            return result.length > 0 ? result[0] as StudentResponseProps : null
        }catch(err) {
            throw new InternalServerError("Internal Server Error", 500, err);
        }
    }

    // this function return all the students that belong to a specific classroom
    async getStudentByClassroomId(id: number):Promise<StudentWithClassroom[]> {
        try {
            const query = `
            SELECT 
            e.id AS enrollmentId,
            s.id AS studentId,
            s.lrn AS studentLrn,
            s.email AS studentEmail,
            CONCAT(s.firstname, ' ', s.middlename, ' ', s.lastname, IF(s.suffix IS NOT NULL, CONCAT(' ', s.suffix), '')) AS fullname,
            s.birthdate AS studentBirthdate,
            TIMESTAMPDIFF(YEAR, s.birthdate, CURDATE()) AS studentAge,
            s.sex AS studentSex
            FROM class_students cs 
            INNER JOIN enrollments e
            ON cs.enrollmentId = e.id AND e.status = 'enrolled'
            INNER JOIN students s
            ON e.studentId = s.id
            WHERE cs.classId = ?
            -- Hide soft-deleted students from faculty rosters
            AND (s.status IS NULL OR s.status <> "inactive")
            `;

            const [result] = await this.connection.execute<RowDataPacket[]>(query, [id]);

            return result as StudentWithClassroom[]
        }catch(err) {
            throw new InternalServerError("Internal Server Error", 500, err);
        }
    }

    // get all student who are not enrolled
    // schoolYearId: when provided, also excludes students with 'completed'
    // enrollments in that school year (they cannot be re-enrolled in the same year).
    async getAllNotEnrolledStudents(searchQuery: string, schoolYearId?: number):Promise<StudentResponseProps[]> {
        try {
            let query = `
                SELECT 
                id, 
                lrn,
                email,
                CONCAT_WS(" ", firstname, middlename, lastname, suffix) AS fullname,
                birthdate,
                TIMESTAMPDIFF(YEAR, birthdate, CURDATE()) as age,
                sex,
                created_at,
                updated_at
                FROM students
                WHERE status = "active" AND (lrn LIKE ? OR email LIKE ?)
                AND id NOT IN (SELECT studentId FROM enrollments WHERE status = 'enrolled')
            `;
            const params: (string | number)[] = [`%${searchQuery}%`, `%${searchQuery}%`];

            if (schoolYearId) {
                query += ` AND id NOT IN (SELECT studentId FROM enrollments WHERE schoolYearId = ? AND status = 'completed')`;
                params.push(schoolYearId);
            }

            const [result] = await this.connection.execute<RowDataPacket[]>(query, params);

            return result as StudentResponseProps[];
        }catch(err) {
            throw new InternalServerError("Internal Server error", 500, err);
        }
    }

    // Soft delete student by ID (hide from lists, keep related records)
    async deleteStudentById(id: number):Promise<void> {
        try {
            const query = `
                UPDATE students
                SET status = "inactive"
                WHERE id = ? AND (status IS NULL OR status <> "inactive")
            `;

            const [result] = await this.connection.execute<ResultSetHeader>(query, [id]);

            if (result.affectedRows === 0) {
                throw new NotFoundError(`Student with ID ${id} not found`, 404);
            }
        }catch(err) {
            if (err instanceof NotFoundError) {
                throw err;
            }
            throw new InternalServerError("Internal Server Error", 500, err);
        }
    }

    // Update student by ID
    async updateStudentById(id: number, student: Partial<StudentCreateProps>):Promise<void> {
        
        const updateFields: string[] = []
        const values: (number | string)[] = []

        for (const field of AllowedStudentFields) {
            if (field in student) {
                updateFields.push(`${field} = ?`);
                values.push((student as any)[field]);
            }
        }

        try {
            const query = `
                UPDATE students
                SET ${updateFields.join(", ")}
                WHERE id = ?
            `;
            await this.connection.execute<ResultSetHeader>(query, [...values, id]);
        }catch(err) {
            throw new InternalServerError("Internal Server Error", 500, err);
        }
    }
}