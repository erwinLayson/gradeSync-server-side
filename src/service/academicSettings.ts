import { getDBPoolConnection } from "../config/database.js";
import { NotFoundError } from "../middleware/errors.js";

import AcademicSettingsModel from "../model/academicSettings.js";

// Hard enforcement: advancing the quarter requires every student record for the
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

export async function updateAcademicSettingsService(updates: AcademicSettingsUpdateProps): Promise<AcademicSettingsProps> {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        const model = new AcademicSettingsModel(connection);
        const existing = await model.getSettings();
        if (!existing) {
            throw new NotFoundError("Academic settings not found", 404);
        }

        // Only advancing to a NEW quarter is gated; rewinds and same-quarter
        // saves are allowed (rewind = deliberate reopening for corrections).
        if (updates.currentQuarter !== undefined && updates.currentQuarter > existing.currentQuarter) {
            await assertQuarterCompleteService(existing.currentQuarter, connection);
        }

        await model.updateSettings(existing.id, updates);

        const updated = await model.getSettings();
        if (!updated) {
            throw new NotFoundError("Academic settings not found after update", 404);
        }
        return updated;
    } finally {
        connection.release();
    }
}
