import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";

import { getDBPoolConnection } from "../config/database.js";
import { InternalServerError } from "../middleware/errors.js";

/**
 * Developer-only data wipe (docs/developer-data-wipe-plan.md Phase A).
 *
 * Deletes rows with FK-safe ordering (children before parents), inside a
 * single transaction per scope so a mid-wipe failure can never leave the
 * database half-blanked. Admin + developer user rows and landing_content
 * are HARD exemptions that no scope can ever delete.
 */

// NOTE: there is no `student_report_card` or `uploads` table in the schema —
// report cards are computed from student_academic_records/attendance, and
// uploads live on disk only (handled by the controller).
export const WIPE_DOMAINS = ["all", "academics", "attendance", "enrollments", "users", "structure", "settings", "uploads"] as const;

export type WipeScope = (typeof WIPE_DOMAINS)[number];

/** The exact phrase the operator must send for each scope (case-sensitive). */
export const WIPE_PHRASES: Record<WipeScope, string> = {
    all: "WIPE ALL DATA",
    academics: "WIPE GRADES",
    attendance: "WIPE ATTENDANCE",
    enrollments: "WIPE ENROLLMENTS",
    users: "WIPE USERS",
    structure: "WIPE STRUCTURE",
    settings: "WIPE SETTINGS",
    uploads: "WIPE UPLOADS",
};

/** Tables that no wipe action may ever touch. */
const EXEMPT_TABLES = new Set(["landing_content"]);

/** One DELETE step: table label (for the receipt) + SQL. */
interface WipeStep {
    table: string;
    sql: string;
}

// FK-safe ordering: children before parents.
const ACADEMICS: WipeStep[] = [
    { table: "student_academic_record_components", sql: "DELETE FROM student_academic_record_components" },
    { table: "student_academic_record_quarters", sql: "DELETE FROM student_academic_record_quarters" },
    { table: "student_academic_record_subjects", sql: "DELETE FROM student_academic_record_subjects" },
    { table: "student_academic_records", sql: "DELETE FROM student_academic_records" },
    { table: "student_scores", sql: "DELETE FROM student_scores" },
    { table: "assessments", sql: "DELETE FROM assessments" },
    { table: "subject_components", sql: "DELETE FROM subject_components" },
    { table: "grading_weights", sql: "DELETE FROM grading_weights" },
    { table: "class_subjects", sql: "DELETE FROM class_subjects" },
    { table: "teacher_subject_assignment", sql: "DELETE FROM teacher_subject_assignment" },
    { table: "class_teacher", sql: "DELETE FROM class_teacher" },
];

const ATTENDANCE: WipeStep[] = [
    { table: "student_attendance", sql: "DELETE FROM student_attendance" },
    { table: "class_daily_attendance", sql: "DELETE FROM class_daily_attendance" },
];

const ENROLLMENTS: WipeStep[] = [
    { table: "enrollment_details", sql: "DELETE FROM enrollment_details" },
    { table: "class_students", sql: "DELETE FROM class_students" },
    { table: "enrollments", sql: "DELETE FROM enrollments" },
];

const USERS_STEPS: WipeStep[] = [
    // A STANDALONE users wipe runs while classrooms/subjects/enrollments may
    // still exist, so every RESTRICT reference into users/teachers/students
    // must be cleared first (the master "all" scope already removed most of
    // these; DELETEs are idempotent so the extra steps are harmless there).
    { table: "class_teacher", sql: "DELETE FROM class_teacher" },
    { table: "teacher_subject_assignment", sql: "DELETE FROM teacher_subject_assignment" },
    // students.userId → users is ON DELETE CASCADE, so removing the users rows
    // deletes students (→ student_details, enrollments via RESTRICT rows must
    // already be gone — enrollments wiped before USERS in the master scope).
    { table: "teachers", sql: "DELETE FROM teachers" },
    {
        table: "users (teacher/student)",
        sql: "DELETE FROM users WHERE role NOT IN ('admin', 'developer')",
    },
];

const STRUCTURE: WipeStep[] = [
    { table: "classrooms", sql: "DELETE FROM classrooms" },
    { table: "subjects", sql: "DELETE FROM subjects" },
];

const SETTINGS: WipeStep[] = [
    { table: "grading_weight_defaults", sql: "DELETE FROM grading_weight_defaults" },
    { table: "academic_settings", sql: "DELETE FROM academic_settings" },
    { table: "school_info", sql: "DELETE FROM school_info" },
    { table: "schoolyear", sql: "DELETE FROM schoolyear" },
];

// The master scope runs every domain in dependency order.
const ALL: WipeStep[][] = [
    ACADEMICS,
    ATTENDANCE,
    ENROLLMENTS,
    USERS_STEPS,
    STRUCTURE,
    SETTINGS,
];

/** Steps for a scope; "uploads" is file-system work handled by the controller. */
export function wipeStepsFor(scope: WipeScope): WipeStep[][] {
    switch (scope) {
        case "all":
            return ALL;
        case "academics":
            return [ACADEMICS];
        case "attendance":
            return [ATTENDANCE];
        case "enrollments":
            return [ENROLLMENTS];
        case "users":
            // Deleting user accounts cascades into students, whose rows are
            // RESTRICT-referenced by enrollments (→ academic records). A
            // standalone users wipe therefore has to clear those domains
            // first — documented in the UI so the operator is not surprised.
            return [ACADEMICS, ATTENDANCE, ENROLLMENTS, USERS_STEPS];
        case "structure":
            return [STRUCTURE];
        case "settings":
            return [SETTINGS];
        case "uploads":
            return [];
    }
}

export interface WipeTableReceipt {
    table: string;
    deleted: number;
}

export interface WipeResult {
    tables: WipeTableReceipt[];
    durationMs: number;
}

/**
 * Run the DELETE batches for a scope inside one transaction.
 * `requesterId` is the developer's own user id — asserted present before the
 * users wipe so an operator can never lock themselves out.
 */
export async function executeWipe(scope: WipeScope, requesterId: number): Promise<WipeResult> {
    const connection = await getDBPoolConnection().getConnection();
    const started = Date.now();
    const tables: WipeTableReceipt[] = [];

    try {
        await connection.beginTransaction();

        // Self-protection: the requester must exist and be a developer. If the
        // users scope would remove them, abort instead of locking everyone out.
        const [requesterRows] = await connection.execute<RowDataPacket[]>(
            "SELECT id, role FROM users WHERE id = ? LIMIT 1",
            [requesterId],
        );
        const requester = requesterRows[0] as { id: number; role: string } | undefined;
        if (!requester || requester.role !== "developer") {
            throw new InternalServerError("Wipe aborted: requesting developer account not found", 500);
        }

        // Merge duplicates: a step can legitimately run twice (e.g.
        // class_teacher is cleared in both the academics chain and the users
        // pre-clean), and the receipt should show one honest total per table.
        const byTable = new Map<string, WipeTableReceipt>();
        for (const batch of wipeStepsFor(scope)) {
            for (const step of batch) {
                if (EXEMPT_TABLES.has(step.table)) continue;
                const [result] = await connection.execute<ResultSetHeader>(step.sql);
                const deleted = result.affectedRows ?? 0;
                const existing = byTable.get(step.table);
                if (existing) existing.deleted += deleted;
                else byTable.set(step.table, { table: step.table, deleted });
            }
        }
        tables.push(...byTable.values());

        // Final guardrail for user-touching scopes: at least one admin and one
        // developer login must survive (the requester was verified above, but
        // this also covers seeded-from-scratch databases).
        if (scope === "all" || scope === "users") {
            const [roleRows] = await connection.execute<RowDataPacket[]>(
                "SELECT role, COUNT(*) AS count FROM users WHERE role IN ('admin', 'developer') GROUP BY role",
            );
            const counts = new Map(
                (roleRows as { role: string; count: number }[]).map((r) => [r.role, Number(r.count)]),
            );
            if ((counts.get("admin") ?? 0) < 1 || (counts.get("developer") ?? 0) < 1) {
                throw new InternalServerError(
                    "Wipe aborted: at least one admin and one developer login must survive",
                    500,
                );
            }
        }

        await connection.commit();
        return { tables, durationMs: Date.now() - started };
    } catch (err) {
        await connection.rollback();
        if (err instanceof InternalServerError) throw err;
        throw new InternalServerError("Wipe failed and was rolled back", 500, err);
    } finally {
        connection.release();
    }
}

/** Read-only row counts per wipeable table, for the client's preview card. */
export async function getWipeStatus(): Promise<{ table: string; rows: number }[]> {
    const connection = await getDBPoolConnection().getConnection();
    try {
        const statusTables = [
            "students",
            "student_details",
            "teachers",
            "classrooms",
            "subjects",
            "class_subjects",
            "class_students",
            "enrollments",
            "enrollment_details",
            "assessments",
            "student_scores",
            "student_academic_records",
            "student_attendance",
            "class_daily_attendance",
            "schoolyear",
            "academic_settings",
            "grading_weights",
            "grading_weight_defaults",
        ];

        const counts: { table: string; rows: number }[] = [];
        for (const table of statusTables) {
            const [rows] = await connection.execute<RowDataPacket[]>(
                `SELECT COUNT(*) AS count FROM \`${table}\``,
            );
            counts.push({ table, rows: Number((rows[0] as { count: number }).count) });
        }

        const [userRows] = await connection.execute<RowDataPacket[]>(
            "SELECT role, COUNT(*) AS count FROM users GROUP BY role",
        );
        for (const row of userRows as { role: string; count: number }[]) {
            counts.push({ table: `users · ${row.role}`, rows: Number(row.count) });
        }

        return counts;
    } catch (err) {
        throw new InternalServerError("Could not read wipe status", 500, err);
    } finally {
        connection.release();
    }
}
