import { getDBPoolConnection } from "../config/database.js";
import { BadRequestError, InternalServerError } from "../middleware/errors.js";
import type { RowDataPacket } from "mysql2/promise";

import AcademicSettingsModel from "../model/academicSettings.js";

// Enforcement: advancing the quarter requires every student record for the
// completed quarter to be submitted first (see docs/student-record-submission.md).
import { assertQuarterCompleteService } from "./studentRecord.js";

import type { AcademicSettingsProps, AcademicSettingsUpdateProps } from "../constant/academicSettings.js";

export async function getAcademicSettingsService(): Promise<AcademicSettingsProps | null> {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        const model = new AcademicSettingsModel(connection);
        return await model.getSettings();
    } finally {
        connection.release();
    }
}

/** Convenience helper — returns the configured number of quarters (default 4). */
export async function getNumQuarters(): Promise<number> {
    const settings = await getAcademicSettingsService();
    return settings?.numQuarters ?? 4;
}

/** Check whether any Quarter 4 data exists in the system. */
export async function checkQuarter4DataExists(): Promise<{
    hasQuarter4Data: boolean;
    counts: { assessments: number; scores: number; attendance: number; dailyAttendance: number; submissions: number };
}> {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        const [assessmentsRows] = await connection.execute<RowDataPacket[]>(
            "SELECT COUNT(*) AS assessments FROM assessments WHERE quarter = 4"
        );
        const [scoresRows] = await connection.execute<RowDataPacket[]>(
            `SELECT COUNT(*) AS scores FROM student_scores s
             JOIN assessments a ON s.assessmentId = a.id
             WHERE a.quarter = 4`
        );
        const [attendanceRows] = await connection.execute<RowDataPacket[]>(
            "SELECT COUNT(*) AS attendance FROM student_attendance WHERE quarter = 4"
        );
        const [dailyAttendanceRows] = await connection.execute<RowDataPacket[]>(
            "SELECT COUNT(*) AS dailyAttendance FROM class_daily_attendance WHERE quarter = 4"
        );
        const [submissionsRows] = await connection.execute<RowDataPacket[]>(
            "SELECT COUNT(*) AS submissions FROM student_academic_record_quarters WHERE quarter = 4 AND status = 'submitted'"
        );

        const assessments = Number(assessmentsRows[0]?.assessments ?? 0);
        const scores = Number(scoresRows[0]?.scores ?? 0);
        const attendance = Number(attendanceRows[0]?.attendance ?? 0);
        const dailyAttendance = Number(dailyAttendanceRows[0]?.dailyAttendance ?? 0);
        const submissions = Number(submissionsRows[0]?.submissions ?? 0);

        const hasQuarter4Data = (assessments + scores + attendance + dailyAttendance + submissions) > 0;
        return { hasQuarter4Data, counts: { assessments, scores, attendance, dailyAttendance, submissions } };
    } finally {
        connection.release();
    }
}

export async function updateAcademicSettingsService(
    updates: AcademicSettingsUpdateProps,
    confirmForce?: boolean
): Promise<{ settings: AcademicSettingsProps; quarter4Warning?: { counts: Record<string, number> } }> {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        const model = new AcademicSettingsModel(connection);
        // Self-heal: seed the default row when the table is empty (e.g. after a
        // settings wipe) instead of failing every save with 404.
        const existing = await model.ensureSettings();

        // Validate numQuarters if provided
        if (updates.numQuarters !== undefined) {
            if (updates.numQuarters !== 3 && updates.numQuarters !== 4) {
                throw new BadRequestError("numQuarters must be 3 or 4");
            }

            // Cannot reduce to 3 quarters if currentQuarter is 4
            if (updates.numQuarters === 3 && existing.currentQuarter === 4) {
                throw new BadRequestError("Cannot switch to 3 quarters while Quarter 4 is the active quarter. Advance or rewind the current quarter first.");
            }

            // When switching from 4 → 3, check if Q4 data exists
            if (existing.numQuarters === 4 && updates.numQuarters === 3 && !confirmForce) {
                const q4Check = await checkQuarter4DataExists();
                if (q4Check.hasQuarter4Data) {
                    return {
                        settings: existing,
                        quarter4Warning: { counts: q4Check.counts }
                    };
                }
            }
        }

        // Only advancing to a NEW quarter is gated; rewinds and same-quarter
        // saves are allowed (rewind = deliberate reopening for corrections).
        if (updates.currentQuarter !== undefined && updates.currentQuarter > existing.currentQuarter) {
            await assertQuarterCompleteService(existing.currentQuarter, connection);
        }

        await model.updateSettings(existing.id, updates);

        const updated = await model.getSettings();
        if (!updated) {
            throw new InternalServerError("Academic settings not found after update", 500);
        }
        return { settings: updated };
    } finally {
        connection.release();
    }
}
