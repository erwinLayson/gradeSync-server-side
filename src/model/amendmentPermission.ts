import { PoolConnection, type ResultSetHeader, type RowDataPacket } from "mysql2/promise";
import { getDBPoolConnection } from "../config/database.js";
import { InternalServerError } from "../middleware/errors.js";
import type { AmendmentPermissionRow } from "../constant/amendment.js";

export default class AmendmentPermissionModel {
    constructor(private connection?: PoolConnection) {}

    private async getConnection(): Promise<{ conn: PoolConnection; shouldRelease: boolean }> {
        if (this.connection) {
            return { conn: this.connection, shouldRelease: false };
        }
        const pool = getDBPoolConnection();
        const conn = await pool.getConnection();
        return { conn, shouldRelease: true };
    }

    async createPermission(data: {
        requestId: number;
        facultyId: number;
        enrollmentId: number;
        classSubjectId?: number | null;
        classId: number;
        quarter: number;
        recordType: string;
        assessmentId?: number | null;
        attendanceDate?: string | null;
        durationHours: number;
    }): Promise<number> {
        const { conn, shouldRelease } = await this.getConnection();
        try {
            const query = `
                INSERT INTO amendment_permissions (
                    requestId, facultyId, enrollmentId, classSubjectId, classId,
                    quarter, recordType, assessmentId, attendanceDate, status, expiresAt
                ) VALUES (
                    ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active',
                    DATE_ADD(CURRENT_TIMESTAMP, INTERVAL ? HOUR)
                )
            `;
            const values = [
                data.requestId,
                data.facultyId,
                data.enrollmentId,
                data.classSubjectId ?? null,
                data.classId,
                data.quarter,
                data.recordType,
                data.assessmentId ?? null,
                data.attendanceDate ?? null,
                data.durationHours
            ];
            const [result] = await conn.execute<ResultSetHeader>(query, values);
            return result.insertId;
        } catch (err) {
            throw new InternalServerError("Failed to create amendment permission", 500, err);
        } finally {
            if (shouldRelease) conn.release();
        }
    }

    async getActivePermission(
        facultyId: number,
        enrollmentId: number,
        classSubjectId: number | null | undefined,
        quarter: number,
        recordType: string
    ): Promise<AmendmentPermissionRow | null> {
        const { conn, shouldRelease } = await this.getConnection();
        try {
            const query = `
                SELECT * FROM amendment_permissions
                WHERE facultyId = ?
                  AND enrollmentId = ?
                  AND (classSubjectId = ? OR (? IS NULL AND classSubjectId IS NULL))
                  AND quarter = ?
                  AND recordType = ?
                  AND status = 'active'
                  AND expiresAt > CURRENT_TIMESTAMP
                LIMIT 1
            `;
            const [rows] = await conn.execute<RowDataPacket[]>(query, [
                facultyId,
                enrollmentId,
                classSubjectId ?? null,
                classSubjectId ?? null,
                quarter,
                recordType
            ]);
            return rows.length > 0 ? (rows[0] as AmendmentPermissionRow) : null;
        } catch (err) {
            throw new InternalServerError("Failed to get active amendment permission", 500, err);
        } finally {
            if (shouldRelease) conn.release();
        }
    }

    async getPermissionByRequestId(requestId: number): Promise<AmendmentPermissionRow | null> {
        const { conn, shouldRelease } = await this.getConnection();
        try {
            const query = `SELECT * FROM amendment_permissions WHERE requestId = ? LIMIT 1`;
            const [rows] = await conn.execute<RowDataPacket[]>(query, [requestId]);
            return rows.length > 0 ? (rows[0] as AmendmentPermissionRow) : null;
        } catch (err) {
            throw new InternalServerError("Failed to get permission by request ID", 500, err);
        } finally {
            if (shouldRelease) conn.release();
        }
    }

    async consumePermission(id: number): Promise<boolean> {
        const { conn, shouldRelease } = await this.getConnection();
        try {
            const query = `
                UPDATE amendment_permissions
                SET status = 'consumed',
                    consumedAt = CURRENT_TIMESTAMP
                WHERE id = ? AND status = 'active'
            `;
            const [result] = await conn.execute<ResultSetHeader>(query, [id]);
            return result.affectedRows > 0;
        } catch (err) {
            throw new InternalServerError("Failed to consume amendment permission", 500, err);
        } finally {
            if (shouldRelease) conn.release();
        }
    }

    async revokePermission(requestId: number): Promise<boolean> {
        const { conn, shouldRelease } = await this.getConnection();
        try {
            const query = `
                UPDATE amendment_permissions
                SET status = 'revoked'
                WHERE requestId = ? AND status = 'active'
            `;
            const [result] = await conn.execute<ResultSetHeader>(query, [requestId]);
            return result.affectedRows > 0;
        } catch (err) {
            throw new InternalServerError("Failed to revoke amendment permission", 500, err);
        } finally {
            if (shouldRelease) conn.release();
        }
    }

    async expireOverduePermissions(): Promise<number> {
        const { conn, shouldRelease } = await this.getConnection();
        try {
            const query = `
                UPDATE amendment_permissions
                SET status = 'expired'
                WHERE status = 'active' AND expiresAt <= CURRENT_TIMESTAMP
            `;
            const [result] = await conn.execute<ResultSetHeader>(query);
            return result.affectedRows;
        } catch (err) {
            throw new InternalServerError("Failed to expire overdue permissions", 500, err);
        } finally {
            if (shouldRelease) conn.release();
        }
    }
}

