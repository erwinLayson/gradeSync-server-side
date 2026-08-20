import { PoolConnection, type ResultSetHeader, type RowDataPacket } from "mysql2/promise";

// Error
import { InternalServerError } from "../middleware/errors.js";

// Types
import type { StudentDetailsProps, StudentDetailsUpdateProps } from "../constant/studentDetails.js";
import { AllowedStudentDetailsFields } from "../constant/studentDetails.js";

export default class StudentDetailsModel {
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

    // Core student row (admin-managed fields) — used for the read-only profile header.
    async getStudentRow(studentId: number): Promise<RowDataPacket | null> {
        try {
            const query = `
                SELECT id, lrn, email, firstname, middlename, lastname, suffix, birthdate, sex
                FROM students
                WHERE id = ?
                LIMIT 1
            `;
            const [rows] = await this.connection.execute<RowDataPacket[]>(query, [studentId]);
            const row = rows[0];
            return row !== undefined ? (row as RowDataPacket) : null;
        } catch (err) {
            throw new InternalServerError("Failed to fetch student record", 500, err);
        }
    }

    async getStudentDetailsByStudentId(studentId: number): Promise<StudentDetailsProps | null> {
        try {
            const query = "SELECT * FROM student_details WHERE studentId = ? LIMIT 1";
            const [rows] = await this.connection.execute<RowDataPacket[]>(query, [studentId]);
            const row = rows[0];
            return row !== undefined ? (row as StudentDetailsProps) : null;
        } catch (err) {
            throw new InternalServerError("Failed to fetch student details", 500, err);
        }
    }

    // 1:1 upsert — INSERT when the student has no row yet, UPDATE otherwise.
    async upsertStudentDetails(studentId: number, details: StudentDetailsUpdateProps): Promise<void> {
        const fields = AllowedStudentDetailsFields.filter((field) => field in details);
        if (fields.length === 0) {
            return;
        }

        const assignments = fields.map((field) => `${field} = ?`);
        const values = fields.map((field) => (details as any)[field] ?? null);

        try {
            const query = `
                INSERT INTO student_details (studentId, ${fields.join(", ")})
                VALUES (?, ${fields.map(() => "?").join(", ")})
                ON DUPLICATE KEY UPDATE ${assignments.join(", ")}
            `;
            await this.connection.execute<ResultSetHeader>(query, [studentId, ...values, ...values]);
        } catch (err) {
            throw new InternalServerError("Failed to save student details", 500, err);
        }
    }
}
