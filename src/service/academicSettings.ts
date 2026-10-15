import { getDBPoolConnection } from "../config/database.js";
import { BadRequestError, InternalServerError } from "../middleware/errors.js";
import type { RowDataPacket } from "mysql2/promise";

import { classifyQuarterTransition, isValidQuarter, MAX_QUARTERS, MIN_QUARTERS } from "../helper/quarterValidation.js";

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

/** Convenience helper — returns the configured current quarter (default 1). */
export async function getCurrentQuarter(): Promise<number> {
    const settings = await getAcademicSettingsService();
    return settings?.currentQuarter ?? 1;
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
        // settings wipe) instead of failing every save with 404. Runs BEFORE the
        // transaction so the locking read below always has a row to lock.
        const existing = await model.ensureSettings();

        // ------------------------------------------------------------------
        // Quarter CONFIGURATION (numQuarters) is a separate concern from the
        // quarter TRANSITION. Reducing 4 → 3 may need the Q4-data confirmation,
        // which returns without writing anything, so it is handled before the
        // transaction opens.
        // ------------------------------------------------------------------
        if (updates.numQuarters !== undefined) {
            if (updates.numQuarters !== MIN_QUARTERS && updates.numQuarters !== MAX_QUARTERS) {
                throw new BadRequestError(`numQuarters must be ${MIN_QUARTERS} or ${MAX_QUARTERS}`);
            }

            // When switching from 4 → 3, check if Q4 data exists
            if (existing.numQuarters === MAX_QUARTERS && updates.numQuarters === MIN_QUARTERS && !confirmForce) {
                const q4Check = await checkQuarter4DataExists();
                if (q4Check.hasQuarter4Data) {
                    return {
                        settings: existing,
                        quarter4Warning: { counts: q4Check.counts }
                    };
                }
            }
        }

        // ------------------------------------------------------------------
        // The transition itself runs in ONE transaction that first takes an
        // exclusive lock on the settings row. A second advancement request
        // therefore blocks here, then re-reads the quarter this one committed,
        // instead of validating and writing against the stale value it read
        // before (which could let two admins advance based on the same state).
        // ------------------------------------------------------------------
        async function applyTransition(): Promise<AcademicSettingsProps> {
            await connection.beginTransaction();
            try {
                const current = await model.getSettingsForUpdate();
                if (!current) {
                    throw new InternalServerError("Academic settings not found", 500);
                }

                // The bound for the requested quarter is the CONFIGURED number of
                // quarters (after this request's change, if any) — not the system
                // maximum. Previously a 3-quarter school could be pushed to Q4.
                const effectiveNumQuarters = updates.numQuarters ?? current.numQuarters;

                if (updates.numQuarters === MIN_QUARTERS && current.currentQuarter === MAX_QUARTERS) {
                    throw new BadRequestError(
                        "Cannot switch to 3 quarters while Quarter 4 is the active quarter. Advance or rewind the current quarter first."
                    );
                }

                if (updates.currentQuarter !== undefined) {
                    if (!isValidQuarter(updates.currentQuarter, effectiveNumQuarters)) {
                        throw new BadRequestError(
                            `currentQuarter must be an integer between 1 and ${effectiveNumQuarters}`
                        );
                    }

                    // TRANSITION POLICY (explicit — see docs/quarter-advancement.md):
                    //   advance (exactly +1) → completeness-gated below
                    //   skip    (+2 or more) → refused; one quarter at a time
                    //   same                 → idempotent no-op, nothing to check
                    //   rewind  (any lower)  → allowed: a deliberate correction that
                    //                          re-opens an earlier quarter. Frozen
                    //                          records are never touched, so no
                    //                          completeness gate applies.
                    const transition = classifyQuarterTransition(current.currentQuarter, updates.currentQuarter);

                    if (transition === "skip") {
                        throw new BadRequestError(
                            `Cannot skip quarters: advance one quarter at a time (current Quarter ${current.currentQuarter}, requested Quarter ${updates.currentQuarter}).`
                        );
                    }

                    if (transition === "advance") {
                        // Throws ConflictError when no active school year is set,
                        // when a class has no adviser, or when a class still has
                        // unsubmitted students for the current quarter.
                        await assertQuarterCompleteService(current.currentQuarter, connection);
                    }
                }

                await model.updateSettings(current.id, updates);

                const updated = await model.getSettings();
                if (!updated) {
                    throw new InternalServerError("Academic settings not found after update", 500);
                }

                await connection.commit();
                return updated;
            } catch (err) {
                // A rejected transition must never leave partial settings behind.
                await connection.rollback();
                throw err;
            }
        }

        const settings = await applyTransition();
        return { settings };
    } finally {
        connection.release();
    }
}
