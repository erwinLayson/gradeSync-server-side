import { PoolConnection, type ResultSetHeader, type RowDataPacket } from "mysql2/promise";
import { getDBPoolConnection } from "../config/database.js";
import { InternalServerError } from "../middleware/errors.js";
import type {
    AmendmentRequestCreateProps,
    AmendmentRequestRow,
    AmendmentStatus
} from "../constant/amendment.js";

export default class AmendmentRequestModel {
    constructor(private connection?: PoolConnection) {}

    private async getConnection(): Promise<{ conn: PoolConnection; shouldRelease: boolean }> {
        if (this.connection) {
            return { conn: this.connection, shouldRelease: false };
        }
        const pool = getDBPoolConnection();
        const conn = await pool.getConnection();
        return { conn, shouldRelease: true };
    }

    async generateRequestNumber(): Promise<string> {
        const { conn, shouldRelease } = await this.getConnection();
        try {
            const year = new Date().getFullYear();
            const prefix = `AMD-${year}-`;
            const query = `
                SELECT requestNumber FROM amendment_requests 
                WHERE requestNumber LIKE ? 
                ORDER BY id DESC LIMIT 1
            `;
            const [rows] = await conn.execute<RowDataPacket[]>(query, [`${prefix}%`]);
            if (rows.length === 0 || !rows[0]) {
                return `${prefix}0001`;
            }
            const lastNum = (rows[0] as { requestNumber?: string }).requestNumber;
            if (!lastNum) {
                return `${prefix}0001`;
            }
            const seqStr = lastNum.replace(prefix, "");
            const nextSeq = (parseInt(seqStr, 10) || 0) + 1;
            return `${prefix}${String(nextSeq).padStart(4, "0")}`;
        } catch (err) {
            throw new InternalServerError("Failed to generate amendment request number", 500, err);
        } finally {
            if (shouldRelease) conn.release();
        }
    }

    async createRequest(
        facultyId: number,
        props: AmendmentRequestCreateProps,
        requestNumber: string
    ): Promise<number> {
        const { conn, shouldRelease } = await this.getConnection();
        try {
            const query = `
                INSERT INTO amendment_requests (
                    requestNumber, requesterFacultyId, enrollmentId, classSubjectId, 
                    classId, quarter, recordType, reason, details, status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
            `;
            const values = [
                requestNumber,
                facultyId,
                props.enrollmentId,
                props.classSubjectId ?? null,
                props.classId,
                props.quarter,
                props.recordType,
                props.reason.trim(),
                JSON.stringify(props.details)
            ];
            const [result] = await conn.execute<ResultSetHeader>(query, values);
            return result.insertId;
        } catch (err) {
            throw new InternalServerError("Failed to create amendment request", 500, err);
        } finally {
            if (shouldRelease) conn.release();
        }
    }

    async getRequestById(id: number): Promise<AmendmentRequestRow | null> {
        const { conn, shouldRelease } = await this.getConnection();
        try {
            const query = `
                SELECT 
                    ar.*,
                    CONCAT_WS(' ', f.firstname, f.middlename, f.lastname, f.suffix) AS requesterName,
                    CONCAT_WS(' ', s.firstname, s.middlename, s.lastname, s.suffix) AS studentName,
                    s.lrn AS studentLrn,
                    subj.name AS subjectName,
                    c.section,
                    c.gradeLevel,
                    u.email AS reviewerName
                FROM amendment_requests ar
                JOIN faculties f ON f.id = ar.requesterFacultyId
                JOIN enrollments e ON e.id = ar.enrollmentId
                JOIN students s ON s.id = e.studentId
                JOIN classrooms c ON c.id = ar.classId
                LEFT JOIN class_subjects cs ON cs.id = ar.classSubjectId
                LEFT JOIN subjects subj ON subj.id = cs.subjectId
                LEFT JOIN users u ON u.id = ar.reviewerUserId
                WHERE ar.id = ?
                LIMIT 1
            `;
            const [rows] = await conn.execute<RowDataPacket[]>(query, [id]);
            return rows.length > 0 ? (rows[0] as AmendmentRequestRow) : null;
        } catch (err) {
            throw new InternalServerError("Failed to get amendment request", 500, err);
        } finally {
            if (shouldRelease) conn.release();
        }
    }

    async getRequests(filters: {
        status?: AmendmentStatus | undefined;
        quarter?: number | undefined;
        classId?: number | undefined;
        requesterFacultyId?: number | undefined;
        enrollmentId?: number | undefined;
    } = {}): Promise<AmendmentRequestRow[]> {
        const { conn, shouldRelease } = await this.getConnection();
        try {
            const conditions: string[] = [];
            const values: (string | number)[] = [];

            if (filters.status) {
                conditions.push("ar.status = ?");
                values.push(filters.status);
            }
            if (filters.quarter !== undefined) {
                conditions.push("ar.quarter = ?");
                values.push(filters.quarter);
            }
            if (filters.classId !== undefined) {
                conditions.push("ar.classId = ?");
                values.push(filters.classId);
            }
            if (filters.requesterFacultyId !== undefined) {
                conditions.push("ar.requesterFacultyId = ?");
                values.push(filters.requesterFacultyId);
            }
            if (filters.enrollmentId !== undefined) {
                conditions.push("ar.enrollmentId = ?");
                values.push(filters.enrollmentId);
            }

            const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

            const query = `
                SELECT 
                    ar.*,
                    CONCAT_WS(' ', f.firstname, f.middlename, f.lastname, f.suffix) AS requesterName,
                    CONCAT_WS(' ', s.firstname, s.middlename, s.lastname, s.suffix) AS studentName,
                    s.lrn AS studentLrn,
                    subj.name AS subjectName,
                    c.section,
                    c.gradeLevel,
                    u.email AS reviewerName
                FROM amendment_requests ar
                JOIN faculties f ON f.id = ar.requesterFacultyId
                JOIN enrollments e ON e.id = ar.enrollmentId
                JOIN students s ON s.id = e.studentId
                JOIN classrooms c ON c.id = ar.classId
                LEFT JOIN class_subjects cs ON cs.id = ar.classSubjectId
                LEFT JOIN subjects subj ON subj.id = cs.subjectId
                LEFT JOIN users u ON u.id = ar.reviewerUserId
                ${whereClause}
                ORDER BY ar.created_at DESC
            `;

            const [rows] = await conn.execute<RowDataPacket[]>(query, values);
            return rows as AmendmentRequestRow[];
        } catch (err) {
            throw new InternalServerError("Failed to fetch amendment requests", 500, err);
        } finally {
            if (shouldRelease) conn.release();
        }
    }

    async updateStatus(
        id: number,
        status: AmendmentStatus,
        reviewerUserId: number | null,
        rejectionReason?: string | null
    ): Promise<boolean> {
        const { conn, shouldRelease } = await this.getConnection();
        try {
            const query = `
                UPDATE amendment_requests
                SET status = ?,
                    reviewerUserId = ?,
                    reviewedAt = CURRENT_TIMESTAMP,
                    rejectionReason = ?
                WHERE id = ?
            `;
            const [result] = await conn.execute<ResultSetHeader>(query, [
                status,
                reviewerUserId,
                rejectionReason ?? null,
                id
            ]);
            return result.affectedRows > 0;
        } catch (err) {
            throw new InternalServerError("Failed to update amendment request status", 500, err);
        } finally {
            if (shouldRelease) conn.release();
        }
    }

    async markCompleted(id: number): Promise<boolean> {
        const { conn, shouldRelease } = await this.getConnection();
        try {
            const query = `
                UPDATE amendment_requests
                SET status = 'completed',
                    completedAt = CURRENT_TIMESTAMP
                WHERE id = ?
            `;
            const [result] = await conn.execute<ResultSetHeader>(query, [id]);
            return result.affectedRows > 0;
        } catch (err) {
            throw new InternalServerError("Failed to mark amendment request completed", 500, err);
        } finally {
            if (shouldRelease) conn.release();
        }
    }

    async hasActiveOrPendingRequest(
        enrollmentId: number,
        classSubjectId: number | null | undefined,
        quarter: number,
        recordType: string
    ): Promise<boolean> {
        const { conn, shouldRelease } = await this.getConnection();
        try {
            const query = `
                SELECT id FROM amendment_requests
                WHERE enrollmentId = ?
                  AND (classSubjectId = ? OR (? IS NULL AND classSubjectId IS NULL))
                  AND quarter = ?
                  AND recordType = ?
                  AND status IN ('pending', 'approved')
                LIMIT 1
            `;
            const [rows] = await conn.execute<RowDataPacket[]>(query, [
                enrollmentId,
                classSubjectId ?? null,
                classSubjectId ?? null,
                quarter,
                recordType
            ]);
            return rows.length > 0;
        } catch (err) {
            throw new InternalServerError("Failed to check active or pending amendment request", 500, err);
        } finally {
            if (shouldRelease) conn.release();
        }
    }
}
