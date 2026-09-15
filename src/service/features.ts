import { getDBPoolConnection } from "../config/database.js";
import { ForbiddenError } from "../middleware/errors.js";

import FeaturesModel from "../model/features.js";

import type { FeatureFlagMap, FeatureProps, FeatureUpdateProps } from "../constant/features.js";

// GET /features — the flag map consumed by every role's frontend.
export async function getFeatureFlagMapService(): Promise<FeatureFlagMap> {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        const model = new FeaturesModel(connection);
        const features = await model.getAll();
        const map: FeatureFlagMap = {};
        for (const feature of features) {
            map[feature.key] = feature.enabled;
        }
        return map;
    } finally {
        connection.release();
    }
}

export async function getAllFeaturesService(): Promise<FeatureProps[]> {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        const model = new FeaturesModel(connection);
        return await model.getAll();
    } finally {
        connection.release();
    }
}

// PATCH /features/:key — developer only (enforced by route middleware).
export async function updateFeatureService(key: string, updates: FeatureUpdateProps, updatedBy: number): Promise<FeatureProps> {
    // Lockout insurance (docs/role-login-switches-plan.md §2.3): the developer
    // must never be able to lock themselves out. login_developer does not
    // exist as a flag, and any unrecognised login_* key is refused too, so a
    // lockout flag can never be created or disabled into existence via the API.
    if (updates.enabled === false && key.startsWith("login_")) {
        if (key === "login_developer") {
            throw new ForbiddenError("Developer logins cannot be disabled — this switch is intentionally unavailable.");
        }
        const allowedLoginKeys = ["login_admin", "login_teacher", "login_student"];
        if (!allowedLoginKeys.includes(key)) {
            throw new ForbiddenError(`Unknown login switch "${key}" — allowed: ${allowedLoginKeys.join(", ")}`);
        }
    }

    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        const model = new FeaturesModel(connection);
        return await model.setEnabled(key, Boolean(updates.enabled), updatedBy);
    } finally {
        connection.release();
    }
}
