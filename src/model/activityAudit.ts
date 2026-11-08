import { PoolConnection, type ResultSetHeader, type RowDataPacket } from "mysql2/promise";
import { getDBPoolConnection } from "../config/database.js";
import { InternalServerError } from "../middleware/errors.js";
import type {
    ActivityAuditFilter,
    ActivityAuditInput,
    ActivityAuditLogRow,
    ActivityAuditPaginatedResult,
    ActivityAuditPagination,
    ActivityAuditStats,
} from "../constant/activityAudit.js";

function parseJsonField<T>(field: unknown): T | null {
    if (!field) return null;
    if (typeof field === "object") return field as T;
    if (typeof field === "string") {
        try {
            return JSON.parse(field) as T;
        } catch {
            return null;
        }
    }
    return null;
}

function normalizeAuditRow(row: RowDataPacket): ActivityAuditLogRow {
    return {
        id: Number(row.id),
        actorUserId: Number(row.actorUserId),
        actorName: String(row.actorName),
        actorRole: String(row.actorRole),
        actorFacultyId: row.actorFacultyId !== null ? Number(row.actorFacultyId) : null,
        action: row.action,
        description: String(row.description),
        entityType: row.entityType,
        entityId: row.entityId !== null ? String(row.entityId) : null,
        schoolYearId: row.schoolYearId !== null ? Number(row.schoolYearId) : null,
        schoolYear: row.schoolYear !== null ? String(row.schoolYear) : null,
        classroomId: row.classroomId !== null ? Number(row.classroomId) : null,
        classroomName: row.classroomName !== null ? String(row.classroomName) : null,
        gradeLevel: row.gradeLevel !== null ? Number(row.gradeLevel) : null,
        subjectId: row.subjectId !== null ? Number(row.subjectId) : null,
        subjectName: row.subjectName !== null ? String(row.subjectName) : null,
        quarter: row.quarter !== null ? Number(row.quarter) : null,
        status: row.status,
        beforeState: parseJsonField(row.beforeState),
        afterState: parseJsonField(row.afterState),
        diff: parseJsonField(row.diff),
        metadata: parseJsonField(row.metadata),
        ipAddress: row.ipAddress !== null ? String(row.ipAddress) : null,
        userAgent: row.userAgent !== null ? String(row.userAgent) : null,
        created_at: row.created_at,
    };
}

export default class ActivityAuditModel {
    constructor(private connection?: PoolConnection) {}

    private async getConnection(): Promise<{ conn: PoolConnection; shouldRelease: boolean }> {
        if (this.connection) {
            return { conn: this.connection, shouldRelease: false };
        }
        const pool = getDBPoolConnection();
        const conn = await pool.getConnection();
        return { conn, shouldRelease: true };
    }

    async logAudit(data: ActivityAuditInput): Promise<number> {
        const { conn, shouldRelease } = await this.getConnection();
        try {
            const query = `
                INSERT INTO activity_audit_logs (
                    actorUserId, actorName, actorRole, actorFacultyId,
                    action, description, entityType, entityId,
                    schoolYearId, schoolYear, classroomId, classroomName,
                    gradeLevel, subjectId, subjectName, quarter,
                    status, beforeState, afterState, diff, metadata,
                    ipAddress, userAgent
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;

            const values = [
                data.actorUserId,
                data.actorName ?? "System",
                data.actorRole ?? "unknown",
                data.actorFacultyId ?? null,
                data.action,
                data.description,
                data.entityType,
                data.entityId ?? null,
                data.schoolYearId ?? null,
                data.schoolYear ?? null,
                data.classroomId ?? null,
                data.classroomName ?? null,
                data.gradeLevel ?? null,
                data.subjectId ?? null,
                data.subjectName ?? null,
                data.quarter ?? null,
                data.status ?? "success",
                data.beforeState ? JSON.stringify(data.beforeState) : null,
                data.afterState ? JSON.stringify(data.afterState) : null,
                data.diff ? JSON.stringify(data.diff) : null,
                data.metadata ? JSON.stringify(data.metadata) : null,
                data.ipAddress ?? null,
                data.userAgent ?? null,
            ];

            const [result] = await conn.execute<ResultSetHeader>(query, values);
            return result.insertId;
        } catch (err) {
            throw new InternalServerError("Failed to record activity audit log", 500, err);
        } finally {
            if (shouldRelease) conn.release();
        }
    }

    async getAuditLogs(
        filters: ActivityAuditFilter,
        pagination: ActivityAuditPagination
    ): Promise<ActivityAuditPaginatedResult> {
        const { conn, shouldRelease } = await this.getConnection();
        try {
            const conditions: string[] = [];
            const values: (string | number)[] = [];

            if (filters.actorUserId !== undefined) {
                conditions.push("actorUserId = ?");
                values.push(filters.actorUserId);
            }
            if (filters.actorRole) {
                conditions.push("actorRole = ?");
                values.push(filters.actorRole);
            }
            if (filters.action) {
                conditions.push("action = ?");
                values.push(filters.action);
            }
            if (filters.entityType) {
                conditions.push("entityType = ?");
                values.push(filters.entityType);
            }
            if (filters.schoolYearId !== undefined) {
                conditions.push("schoolYearId = ?");
                values.push(filters.schoolYearId);
            }
            if (filters.gradeLevel !== undefined) {
                conditions.push("gradeLevel = ?");
                values.push(filters.gradeLevel);
            }
            if (filters.classroomId !== undefined) {
                conditions.push("classroomId = ?");
                values.push(filters.classroomId);
            }
            if (filters.subjectId !== undefined) {
                conditions.push("subjectId = ?");
                values.push(filters.subjectId);
            }
            if (filters.quarter !== undefined) {
                conditions.push("quarter = ?");
                values.push(filters.quarter);
            }
            if (filters.status) {
                conditions.push("status = ?");
                values.push(filters.status);
            }
            if (filters.dateFrom) {
                conditions.push("created_at >= ?");
                values.push(`${filters.dateFrom} 00:00:00`);
            }
            if (filters.dateTo) {
                conditions.push("created_at <= ?");
                values.push(`${filters.dateTo} 23:59:59`);
            }
            if (filters.search && filters.search.trim() !== "") {
                conditions.push("(description LIKE ? OR actorName LIKE ? OR entityId LIKE ?)");
                const term = `%${filters.search.trim()}%`;
                values.push(term, term, term);
            }

            const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

            // Total count query
            const countQuery = `SELECT COUNT(*) AS total FROM activity_audit_logs ${whereClause}`;
            const [countRows] = await conn.execute<RowDataPacket[]>(countQuery, values);
            const total = Number(countRows[0]?.total ?? 0);

            // Data query
            const page = Math.max(1, pagination.page);
            const limit = Math.max(1, Math.min(100, pagination.limit));
            const offset = (page - 1) * limit;

            const dataQuery = `
                SELECT * FROM activity_audit_logs
                ${whereClause}
                ORDER BY created_at DESC, id DESC
                LIMIT ? OFFSET ?
            `;
            const [dataRows] = await conn.execute<RowDataPacket[]>(dataQuery, [...values, String(limit), String(offset)]);

            const data = (dataRows as RowDataPacket[]).map(normalizeAuditRow);
            const totalPages = Math.ceil(total / limit) || 1;

            return {
                data,
                total,
                page,
                limit,
                totalPages,
            };
        } catch (err) {
            throw new InternalServerError("Failed to retrieve activity audit logs", 500, err);
        } finally {
            if (shouldRelease) conn.release();
        }
    }

    async getAuditLogById(id: number): Promise<ActivityAuditLogRow | null> {
        const { conn, shouldRelease } = await this.getConnection();
        try {
            const query = "SELECT * FROM activity_audit_logs WHERE id = ? LIMIT 1";
            const [rows] = await conn.execute<RowDataPacket[]>(query, [id]);
            if (rows.length === 0 || !rows[0]) return null;
            return normalizeAuditRow(rows[0]);
        } catch (err) {
            throw new InternalServerError("Failed to get activity audit log by ID", 500, err);
        } finally {
            if (shouldRelease) conn.release();
        }
    }

    async getAuditStats(filters?: { schoolYearId?: number }): Promise<ActivityAuditStats> {
        const { conn, shouldRelease } = await this.getConnection();
        try {
            const syFilter = filters?.schoolYearId !== undefined ? "WHERE schoolYearId = ?" : "";
            const syParams = filters?.schoolYearId !== undefined ? [filters.schoolYearId] : [];

            // 1. Overall counts (total, today, this week)
            const countQuery = `
                SELECT 
                    COUNT(*) AS total,
                    SUM(CASE WHEN DATE(created_at) = CURDATE() THEN 1 ELSE 0 END) AS today,
                    SUM(CASE WHEN YEARWEEK(created_at, 1) = YEARWEEK(CURDATE(), 1) THEN 1 ELSE 0 END) AS thisWeek
                FROM activity_audit_logs
                ${syFilter}
            `;
            const [countRows] = await conn.execute<RowDataPacket[]>(countQuery, syParams);
            const total = Number(countRows[0]?.total ?? 0);
            const today = Number(countRows[0]?.today ?? 0);
            const thisWeek = Number(countRows[0]?.thisWeek ?? 0);

            // 2. Grouped by role
            const byRoleQuery = `
                SELECT actorRole AS role, COUNT(*) AS count
                FROM activity_audit_logs
                ${syFilter}
                GROUP BY actorRole
                ORDER BY count DESC
            `;
            const [byRoleRows] = await conn.execute<RowDataPacket[]>(byRoleQuery, syParams);
            const byRole = byRoleRows.map((r) => ({
                role: String(r.role),
                count: Number(r.count),
            }));

            // 3. Grouped by action
            const byActionQuery = `
                SELECT action, COUNT(*) AS count
                FROM activity_audit_logs
                ${syFilter}
                GROUP BY action
                ORDER BY count DESC
            `;
            const [byActionRows] = await conn.execute<RowDataPacket[]>(byActionQuery, syParams);
            const byAction = byActionRows.map((r) => ({
                action: String(r.action),
                count: Number(r.count),
            }));

            // 4. Grouped by user (top 10 actors)
            const byUserQuery = `
                SELECT actorUserId, actorName, actorRole, COUNT(*) AS count
                FROM activity_audit_logs
                ${syFilter}
                GROUP BY actorUserId, actorName, actorRole
                ORDER BY count DESC
                LIMIT 10
            `;
            const [byUserRows] = await conn.execute<RowDataPacket[]>(byUserQuery, syParams);
            const byUser = byUserRows.map((r) => ({
                actorUserId: Number(r.actorUserId),
                actorName: String(r.actorName),
                actorRole: String(r.actorRole),
                count: Number(r.count),
            }));

            // 5. Recent activities (latest 10)
            const recentQuery = `
                SELECT * FROM activity_audit_logs
                ${syFilter}
                ORDER BY created_at DESC, id DESC
                LIMIT 10
            `;
            const [recentRows] = await conn.execute<RowDataPacket[]>(recentQuery, syParams);
            const recentActivities = (recentRows as RowDataPacket[]).map(normalizeAuditRow);

            return {
                total,
                today,
                thisWeek,
                byRole,
                byAction,
                byUser,
                recentActivities,
            };
        } catch (err) {
            throw new InternalServerError("Failed to calculate activity audit statistics", 500, err);
        } finally {
            if (shouldRelease) conn.release();
        }
    }
}
