import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { getDBPoolConnection } from "../config/database.js";
import ActivityAuditModel from "../model/activityAudit.js";
import FacultyModel from "../model/faculties.js";
import UsersModel from "../model/users.js";
import type {
    ActivityAuditFilter,
    ActivityAuditInput,
    ActivityAuditLogRow,
    ActivityAuditPaginatedResult,
    ActivityAuditPagination,
    ActivityAuditStats,
} from "../constant/activityAudit.js";

/**
 * Resolves missing actor identity details (name, faculty role, facultyId) from the database.
 */
async function resolveActorDetails(
    userId: number,
    conn: PoolConnection
): Promise<{ actorName: string; actorRole: string; actorFacultyId: number | null }> {
    // 1. Check if linked to faculty record (teacher or register)
    const facultyModel = new FacultyModel(conn);
    const faculty = await facultyModel.getFacultyByUserId(userId);
    if (faculty) {
        return {
            actorName: faculty.fullname,
            actorRole: faculty.role, // "teacher" | "register"
            actorFacultyId: faculty.id,
        };
    }

    // 2. Otherwise look up in users table (e.g. admin, developer, student)
    const usersModel = new UsersModel(conn);
    const user = await usersModel.getUserById(userId);
    if (user) {
        return {
            actorName: user.email,
            actorRole: user.role,
            actorFacultyId: null,
        };
    }

    return {
        actorName: `User #${userId}`,
        actorRole: "unknown",
        actorFacultyId: null,
    };
}

/**
 * Resolves missing academic labels (school year string, classroom section/name, subject name)
 */
async function resolveAcademicContext(
    data: ActivityAuditInput,
    conn: PoolConnection
): Promise<{
    schoolYear: string | null;
    classroomName: string | null;
    gradeLevel: number | null;
    subjectName: string | null;
}> {
    let schoolYear = data.schoolYear ?? null;
    let classroomName = data.classroomName ?? null;
    let gradeLevel = data.gradeLevel ?? null;
    let subjectName = data.subjectName ?? null;

    if (!schoolYear && data.schoolYearId) {
        const [rows] = await conn.execute<RowDataPacket[]>(
            "SELECT CONCAT(startYear, '-', endYear) AS sy FROM schoolyear WHERE id = ? LIMIT 1",
            [data.schoolYearId]
        );
        if (rows[0]?.sy) {
            schoolYear = String(rows[0].sy);
        }
    }

    if ((!classroomName || gradeLevel === null) && data.classroomId) {
        const [rows] = await conn.execute<RowDataPacket[]>(
            "SELECT gradeLevel, section FROM classrooms WHERE id = ? LIMIT 1",
            [data.classroomId]
        );
        if (rows[0]) {
            if (gradeLevel === null && rows[0].gradeLevel !== undefined) {
                gradeLevel = Number(rows[0].gradeLevel);
            }
            if (!classroomName && rows[0].section) {
                classroomName = `Grade ${rows[0].gradeLevel} - ${rows[0].section}`;
            }
        }
    }

    if (!subjectName && data.subjectId) {
        const [rows] = await conn.execute<RowDataPacket[]>(
            "SELECT name AS subjectName FROM subjects WHERE id = ? LIMIT 1",
            [data.subjectId]
        );
        if (rows[0]?.subjectName) {
            subjectName = String(rows[0].subjectName);
        }
    }

    return { schoolYear, classroomName, gradeLevel, subjectName };
}

/**
 * Centralized audit logging service.
 * Automatically resolves actor names and academic context if missing.
 */
export async function logActivityService(
    entry: ActivityAuditInput,
    conn?: PoolConnection
): Promise<number> {
    const pool = getDBPoolConnection();
    const connection = conn ?? await pool.getConnection();
    const ownConn = !conn;

    try {
        let { actorName, actorRole, actorFacultyId } = entry;
        if (!actorName || !actorRole || actorFacultyId === undefined) {
            const resolvedActor = await resolveActorDetails(entry.actorUserId, connection);
            actorName = actorName ?? resolvedActor.actorName;
            actorRole = actorRole ?? resolvedActor.actorRole;
            actorFacultyId = actorFacultyId ?? resolvedActor.actorFacultyId;
        }

        const academic = await resolveAcademicContext(entry, connection);

        const auditModel = new ActivityAuditModel(connection);
        const logId = await auditModel.logAudit({
            ...entry,
            actorName,
            actorRole,
            actorFacultyId,
            schoolYear: entry.schoolYear ?? academic.schoolYear,
            classroomName: entry.classroomName ?? academic.classroomName,
            gradeLevel: entry.gradeLevel ?? academic.gradeLevel,
            subjectName: entry.subjectName ?? academic.subjectName,
        });

        return logId;
    } catch (err) {
        console.error("[ActivityAudit] Failed to record audit log:", err);
        return 0;
    } finally {
        if (ownConn) {
            connection.release();
        }
    }
}

export async function getActivityAuditLogsService(
    filters: ActivityAuditFilter,
    pagination: ActivityAuditPagination
): Promise<ActivityAuditPaginatedResult> {
    const pool = getDBPoolConnection();
    const conn = await pool.getConnection();
    try {
        const auditModel = new ActivityAuditModel(conn);
        return await auditModel.getAuditLogs(filters, pagination);
    } finally {
        conn.release();
    }
}

export async function getActivityAuditDetailService(id: number): Promise<ActivityAuditLogRow | null> {
    const pool = getDBPoolConnection();
    const conn = await pool.getConnection();
    try {
        const auditModel = new ActivityAuditModel(conn);
        return await auditModel.getAuditLogById(id);
    } finally {
        conn.release();
    }
}

export async function getActivityAuditStatsService(schoolYearId?: number): Promise<ActivityAuditStats> {
    const pool = getDBPoolConnection();
    const conn = await pool.getConnection();
    try {
        const auditModel = new ActivityAuditModel(conn);
        return await auditModel.getAuditStats(schoolYearId ? { schoolYearId } : undefined);
    } finally {
        conn.release();
    }
}
