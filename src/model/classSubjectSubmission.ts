import { PoolConnection, type ResultSetHeader, type RowDataPacket } from "mysql2/promise";
import { getDBPoolConnection } from "../config/database.js";
import { InternalServerError } from "../middleware/errors.js";
import type { ClassSubjectSubmissionRow, QuarterSubmissionStatus } from "../constant/studentRecord.js";

export default class ClassSubjectSubmissionModel {
    constructor(private connection?: PoolConnection) {}

    private async getConnection(): Promise<{ conn: PoolConnection; shouldRelease: boolean }> {
        if (this.connection) {
            return { conn: this.connection, shouldRelease: false };
        }
        const pool = getDBPoolConnection();
        const conn = await pool.getConnection();
        return { conn, shouldRelease: true };
    }

    async upsertSubmission(data: {
        classSubjectId: number;
        quarter: number;
        schoolYearId: number;
        status: QuarterSubmissionStatus;
        submittedBy?: number | null;
        totalStudents: number;
        submittedStudents: number;
    }): Promise<number> {
        const { conn, shouldRelease } = await this.getConnection();
        try {
            const query = `
                INSERT INTO class_subject_submissions (
                    classSubjectId, quarter, schoolYearId, status, 
                    submittedAt, submittedBy, totalStudents, submittedStudents
                ) VALUES (?, ?, ?, ?, IF(? = 'submitted', NOW(), NULL), ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    status = VALUES(status),
                    submittedAt = IF(VALUES(status) = 'submitted', NOW(), submittedAt),
                    submittedBy = IF(VALUES(status) = 'submitted', VALUES(submittedBy), submittedBy),
                    totalStudents = VALUES(totalStudents),
                    submittedStudents = VALUES(submittedStudents),
                    updated_at = CURRENT_TIMESTAMP
            `;
            const values = [
                data.classSubjectId,
                data.quarter,
                data.schoolYearId,
                data.status,
                data.status,
                data.submittedBy ?? null,
                data.totalStudents,
                data.submittedStudents,
            ];
            const [result] = await conn.execute<ResultSetHeader>(query, values);
            return result.insertId;
        } catch (err) {
            throw new InternalServerError("Failed to upsert class subject submission", 500, err);
        } finally {
            if (shouldRelease) conn.release();
        }
    }

    async getSubmission(
        classSubjectId: number,
        quarter: number,
        schoolYearId: number
    ): Promise<ClassSubjectSubmissionRow | null> {
        const { conn, shouldRelease } = await this.getConnection();
        try {
            const query = `
                SELECT * FROM class_subject_submissions
                WHERE classSubjectId = ? AND quarter = ? AND schoolYearId = ?
                LIMIT 1
            `;
            const [rows] = await conn.execute<RowDataPacket[]>(query, [classSubjectId, quarter, schoolYearId]);
            return rows.length > 0 ? (rows[0] as ClassSubjectSubmissionRow) : null;
        } catch (err) {
            throw new InternalServerError("Failed to get class subject submission", 500, err);
        } finally {
            if (shouldRelease) conn.release();
        }
    }

    async getSubmissionsByClassSubjectIds(
        classSubjectIds: number[],
        schoolYearId: number
    ): Promise<ClassSubjectSubmissionRow[]> {
        if (classSubjectIds.length === 0) return [];
        const { conn, shouldRelease } = await this.getConnection();
        try {
            const placeholders = classSubjectIds.map(() => "?").join(", ");
            const query = `
                SELECT * FROM class_subject_submissions
                WHERE classSubjectId IN (${placeholders}) AND schoolYearId = ?
            `;
            const [rows] = await conn.execute<RowDataPacket[]>(query, [...classSubjectIds, schoolYearId]);
            return rows as ClassSubjectSubmissionRow[];
        } catch (err) {
            throw new InternalServerError("Failed to get submissions for class subjects", 500, err);
        } finally {
            if (shouldRelease) conn.release();
        }
    }

    async getAllSubmissionsBySchoolYear(schoolYearId: number): Promise<ClassSubjectSubmissionRow[]> {
        const { conn, shouldRelease } = await this.getConnection();
        try {
            const query = `
                SELECT * FROM class_subject_submissions
                WHERE schoolYearId = ?
            `;
            const [rows] = await conn.execute<RowDataPacket[]>(query, [schoolYearId]);
            return rows as ClassSubjectSubmissionRow[];
        } catch (err) {
            throw new InternalServerError("Failed to get all submissions for school year", 500, err);
        } finally {
            if (shouldRelease) conn.release();
        }
    }
}

