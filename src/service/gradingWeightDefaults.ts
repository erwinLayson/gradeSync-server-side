import { getDBPoolConnection } from "../config/database.js";
import { InternalServerError } from "../middleware/errors.js";

import GradingWeightDefaultsModel from "../model/gradingWeightDefaults.js";

import type { GradingWeightDefaultsProps, GradingWeightDefaultsUpdateProps } from "../constant/gradingWeightDefaults.js";
import type { GradeWeights } from "../constant/grade.js";

export async function getGradingWeightDefaultsService(): Promise<GradingWeightDefaultsProps | null> {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        const model = new GradingWeightDefaultsModel(connection);
        return await model.getDefaults();
    } finally {
        connection.release();
    }
}

export async function updateGradingWeightDefaultsService(updates: GradingWeightDefaultsUpdateProps): Promise<GradingWeightDefaultsProps> {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        const model = new GradingWeightDefaultsModel(connection);
        // Self-heal: seed the default row when the table is empty (e.g. after a
        // settings wipe) instead of failing every save with 404.
        const existing = await model.ensureDefaults();

        await model.updateDefaults(existing.id, updates);

        const updated = await model.getDefaults();
        if (!updated) {
            throw new InternalServerError("Grading weight defaults not found after update", 500);
        }
        return updated;
    } finally {
        connection.release();
    }
}

// Effective default weights as GradeWeights (numbers), used by the gradebook
// fallback. Returns null when the table has no row.
export async function getEffectiveDefaultWeightsService(connection: import("mysql2/promise").PoolConnection): Promise<GradeWeights | null> {
    const model = new GradingWeightDefaultsModel(connection);
    const defaults = await model.getDefaults();
    if (!defaults) {
        return null;
    }
    return {
        writtenWorkWeight: Number(defaults.writtenWorkWeight),
        performanceTaskWeight: Number(defaults.performanceTaskWeight),
        quarterlyAssessmentWeight: Number(defaults.quarterlyAssessmentWeight),
        attendanceWeight: Number(defaults.attendanceWeight)
    };
}
