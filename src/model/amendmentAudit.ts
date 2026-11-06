import { PoolConnection, type ResultSetHeader, type RowDataPacket } from "mysql2/promise";
import { getDBPoolConnection } from "../config/database.js";
import { InternalServerError } from "../middleware/errors.js";
import type { AmendmentAuditAction, AmendmentAuditLogRow } from "../constant/amendment.js";

export default class AmendmentAuditModel {
    constructor(private connection?: PoolConnection) {}

    private async getConnection(): Promise<{ conn: PoolConnection; shouldRelease: boolean }> {
        if (this.connection) {
            return { conn: this.connection, shouldRelease: false };
        }
        const pool = getDBPoolConnection();
        const conn = await pool.getConnection();
        return { conn, shouldRelease: true };
    }

    async logAudit(data: {
        requestId?: number | null;
        action: AmendmentAuditAction;
        actorUserId: number;
        actorRole: string;
        recordType: string;
        enrollmentId: number;
        quarter: number;
        targetTable: string;
        targetRecordId: string;
        beforeState?: unknown | null;
        afterState?: unknown | null;
        diff?: unknown | null;
        reason?: string | null;
        ipAddress?: string | null;
        userAgent?: string | null;
    }): Promise<number> {
        const { conn, shouldRelease } = await this.getConnection();
        try {
            const query = `
                INSERT INTO amendment_audit_logs (
                    requestId, action, actorUserId, actorRole, recordType,
                    enrollmentId, quarter, targetTable, targetRecordId,
                    beforeState, afterState, diff, reason, ipAddress, userAgent
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;
            const values = [
                data.requestId ?? null,
                data.action,
                data.actorUserId,
                data.actorRole,
                data.recordType,
                data.enrollmentId,
                data.quarter,
                data.targetTable,
                data.targetRecordId,
                data.beforeState ? JSON.stringify(data.beforeState) : null,
                data.afterState ? JSON.stringify(data.afterState) : null,
                data.diff ? JSON.stringify(data.diff) : null,
                data.reason ?? null,
                data.ipAddress ?? null,
                data.userAgent ?? null
            ];
            const [result] = await conn.execute<ResultSetHeader>(query, values);
            return result.insertId;
        } catch (err) {
            throw new InternalServerError("Failed to record amendment audit log", 500, err);
        } finally {
            if (shouldRelease) conn.release();
        }
    }

    async getAuditLogsByRequest(requestId: number): Promise<AmendmentAuditLogRow[]> {
        const { conn, shouldRelease } = await this.getConnection();
        try {
            const query = `
                SELECT 
                    aal.*,
                    u.email AS actorName
                FROM amendment_audit_logs aal
                JOIN users u ON u.id = aal.actorUserId
                WHERE aal.requestId = ?
                ORDER BY aal.created_at ASC
            `;
            const [rows] = await conn.execute<RowDataPacket[]>(query, [requestId]);
            return rows as AmendmentAuditLogRow[];
        } catch (err) {
            throw new InternalServerError("Failed to get audit logs by request", 500, err);
        } finally {
            if (shouldRelease) conn.release();
        }
    }

    async getAuditLogsByEnrollment(enrollmentId: number, quarter?: number): Promise<AmendmentAuditLogRow[]> {
        const { conn, shouldRelease } = await this.getConnection();
        try {
            const conditions = ["aal.enrollmentId = ?"];
            const values: (string | number)[] = [enrollmentId];

            if (quarter !== undefined) {
                conditions.push("aal.quarter = ?");
                values.push(quarter);
            }

            const query = `
                SELECT 
                    aal.*,
                    u.email AS actorName
                FROM amendment_audit_logs aal
                JOIN users u ON u.id = aal.actorUserId
                WHERE ${conditions.join(" AND ")}
                ORDER BY aal.created_at DESC
            `;
            const [rows] = await conn.execute<RowDataPacket[]>(query, values);
            return rows as AmendmentAuditLogRow[];
        } catch (err) {
            throw new InternalServerError("Failed to get audit logs by enrollment", 500, err);
        } finally {
            if (shouldRelease) conn.release();
        }
    }

    async getAuditHistory(filters: {
        quarter?: number | undefined;
        recordType?: string | undefined;
        actorUserId?: number | undefined;
        limit?: number | undefined;
        offset?: number | undefined;
    } = {}): Promise<AmendmentAuditLogRow[]> {
        const { conn, shouldRelease } = await this.getConnection();
        try {
            const conditions: string[] = [];
            const values: (string | number)[] = [];

            if (filters.quarter !== undefined) {
                conditions.push("aal.quarter = ?");
                values.push(filters.quarter);
            }
            if (filters.recordType) {
                conditions.push("aal.recordType = ?");
                values.push(filters.recordType);
            }
            if (filters.actorUserId !== undefined) {
                conditions.push("aal.actorUserId = ?");
                values.push(filters.actorUserId);
            }

            const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
            const limit = Math.max(1, Math.min(100, filters.limit ?? 50));
            const offset = Math.max(0, filters.offset ?? 0);

            const query = `
                SELECT 
                    aal.*,
                    u.email AS actorName
                FROM amendment_audit_logs aal
                JOIN users u ON u.id = aal.actorUserId
                ${whereClause}
                ORDER BY aal.created_at DESC
                LIMIT ${limit} OFFSET ${offset}
            `;
            const [rows] = await conn.execute<RowDataPacket[]>(query, values);
            return rows as AmendmentAuditLogRow[];
        } catch (err) {
            throw new InternalServerError("Failed to fetch audit history", 500, err);
        } finally {
            if (shouldRelease) conn.release();
        }
    }
}
