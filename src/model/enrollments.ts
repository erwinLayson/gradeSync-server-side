import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";

// Error
import { InternalServerError } from "../middleware/errors.js";

export default class Enrollments {
    constructor(private connection: PoolConnection) {}

    // Create a new enrollment record (dateEnrolled defaults to today)
    async createEnrollment(classId: number, schoolYearId: number, studentId: number): Promise<number> {
        try {
            const query = `
                INSERT INTO enrollments(dateEnrolled, classId, schoolYearId, studentId)
                VALUES(CURDATE(), ?, ?, ?)
            `;

            const [result] = await this.connection.execute<ResultSetHeader>(query, [classId, schoolYearId, studentId]);
            return result.insertId;
        } catch (err) {
            throw new InternalServerError("Failed to create enrollment", 500, err);
        }
    }

    // Link the enrollment to a classroom
    async createClassStudent(classId: number, enrollmentId: number): Promise<void> {
        try {
            const query = "INSERT INTO class_students(classId, enrollmentId) VALUES(?, ?)";

            await this.connection.execute(query, [classId, enrollmentId]);
        } catch (err) {
            throw new InternalServerError("Failed to link student to classroom", 500, err);
        }
    }

    // Link a subject to the enrollment
    async createEnrollmentDetail(enrollmentId: number, subjectId: number): Promise<void> {
        try {
            const query = "INSERT INTO enrollment_details(enrollmentId, subjectId) VALUES(?, ?)";

            await this.connection.execute(query, [enrollmentId, subjectId]);
        } catch (err) {
            throw new InternalServerError("Failed to link enrollment subject", 500, err);
        }
    }

    // Check whether a student is already enrolled in a given school year
    async isStudentEnrolled(studentId: number, schoolYearId: number): Promise<boolean> {
        try {
            const query = "SELECT id FROM enrollments WHERE studentId = ? AND schoolYearId = ? AND status = 'enrolled' LIMIT 1";

            const [rows] = await this.connection.execute<RowDataPacket[]>(query, [studentId, schoolYearId]);
            return rows.length > 0;
        } catch (err) {
            throw new InternalServerError("Failed to check existing enrollment", 500, err);
        }
    }

    // Get enrollment by ID
    async getEnrollmentById(enrollmentId: number): Promise<RowDataPacket | null> {
        try {
            const query = "SELECT * FROM enrollments WHERE id = ? LIMIT 1";
            const [rows] = await this.connection.execute<RowDataPacket[]>(query, [enrollmentId]);
            return rows[0] ?? null;
        } catch (err) {
            throw new InternalServerError("Failed to get enrollment", 500, err);
        }
    }

    // Soft-delete enrollment (set status to 'unenrolled')
    async softDeleteEnrollment(enrollmentId: number): Promise<void> {
        try {
            const query = "UPDATE enrollments SET status = 'unenrolled' WHERE id = ? AND status = 'enrolled'";
            await this.connection.execute(query, [enrollmentId]);
        } catch (err) {
            throw new InternalServerError("Failed to soft-delete enrollment", 500, err);
        }
    }

    // Delete class_students record by enrollmentId
    async deleteClassStudentByEnrollmentId(enrollmentId: number): Promise<void> {
        try {
            const query = "DELETE FROM class_students WHERE enrollmentId = ?";
            await this.connection.execute(query, [enrollmentId]);
        } catch (err) {
            throw new InternalServerError("Failed to remove student from classroom", 500, err);
        }
    }

    // Delete enrollment_details records by enrollmentId
    async deleteEnrollmentDetailsByEnrollmentId(enrollmentId: number): Promise<void> {
        try {
            const query = "DELETE FROM enrollment_details WHERE enrollmentId = ?";
            await this.connection.execute(query, [enrollmentId]);
        } catch (err) {
            throw new InternalServerError("Failed to remove enrollment details", 500, err);
        }
    }

    // Get student ID from enrollment
    async getStudentIdFromEnrollment(enrollmentId: number): Promise<number | null> {
        try {
            const query = "SELECT studentId FROM enrollments WHERE id = ? LIMIT 1";
            const [rows] = await this.connection.execute<RowDataPacket[]>(query, [enrollmentId]);
            const row = rows[0];
            return row ? row.studentId : null;
        } catch (err) {
            throw new InternalServerError("Failed to get student from enrollment", 500, err);
        }
    }

    async getStudentEnrollmentRecordByStudentId(studentId: number): Promise<{ enrollmentId: number; schoolYear: string; classId: number }[]> {
        try {
            const query = `
                SELECT 
                e.id AS enrollmentId,
                e.classId,
                CONCAT(sy.startYear, "-" , sy.endYear) AS schoolYear
                FROM enrollments e
                JOIN 
                    students s ON s.id = e.studentId
                JOIN 
                    schoolyear sy ON sy.id = e.schoolYearId
                WHERE e.studentId = ?
            `;

            const [row] = await this.connection.execute<RowDataPacket[]>(query, [studentId]);

            return row as { enrollmentId: number; schoolYear: string; classId: number }[];
        }catch(err){
            throw new InternalServerError("Internal Server Error", 500, err);
        }
    }

    // Get existing enrollment for a student in a specific school year (any status)
    async getExistingEnrollment(studentId: number, schoolYearId: number): Promise<{ id: number; classId: number; status: string } | null> {
        try {
            const query = "SELECT id, classId, status FROM enrollments WHERE studentId = ? AND schoolYearId = ? LIMIT 1";
            const [rows] = await this.connection.execute<RowDataPacket[]>(query, [studentId, schoolYearId]);
            const row = rows[0];
            return row ? { id: row.id, classId: row.classId, status: row.status } : null;
        } catch (err) {
            throw new InternalServerError("Failed to get existing enrollment", 500, err);
        }
    }

    // Check if student has grades for a specific quarter
    async hasGradesForQuarter(enrollmentId: number, quarter: number): Promise<boolean> {
        try {
            const query = `
                SELECT COUNT(*) AS cnt
                FROM student_scores ss
                JOIN assessments a ON a.id = ss.assessmentId
                WHERE ss.enrollmentId = ? AND a.quarter = ?
                LIMIT 1
            `;
            const [rows] = await this.connection.execute<RowDataPacket[]>(query, [enrollmentId, quarter]);
            return Number(rows[0]?.cnt ?? 0) > 0;
        } catch (err) {
            throw new InternalServerError("Failed to check grades for quarter", 500, err);
        }
    }

    // Update enrollment class
    async updateEnrollmentClass(enrollmentId: number, classId: number): Promise<void> {
        try {
            const query = "UPDATE enrollments SET classId = ? WHERE id = ?";
            await this.connection.execute(query, [classId, enrollmentId]);
        } catch (err) {
            throw new InternalServerError("Failed to update enrollment class", 500, err);
        }
    }

    // Update enrollment status
    async updateEnrollmentStatus(enrollmentId: number, status: string): Promise<void> {
        try {
            const query = "UPDATE enrollments SET status = ? WHERE id = ?";
            await this.connection.execute(query, [status, enrollmentId]);
        } catch (err) {
            throw new InternalServerError("Failed to update enrollment status", 500, err);
        }
    }

    // Delete student scores by enrollmentId
    async deleteStudentScoresByEnrollmentId(enrollmentId: number): Promise<void> {
        try {
            const query = "DELETE FROM student_scores WHERE enrollmentId = ?";
            await this.connection.execute(query, [enrollmentId]);
        } catch (err) {
            throw new InternalServerError("Failed to delete student scores", 500, err);
        }
    }

    // Delete student attendance by enrollmentId
    async deleteStudentAttendanceByEnrollmentId(enrollmentId: number): Promise<void> {
        try {
            const query = "DELETE FROM student_attendance WHERE enrollmentId = ?";
            await this.connection.execute(query, [enrollmentId]);
        } catch (err) {
            throw new InternalServerError("Failed to delete student attendance", 500, err);
        }
    }
}
