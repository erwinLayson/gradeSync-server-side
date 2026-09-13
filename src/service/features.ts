import { getDBPoolConnection } from "../config/database.js";

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
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        const model = new FeaturesModel(connection);
        return await model.setEnabled(key, Boolean(updates.enabled), updatedBy);
    } finally {
        connection.release();
    }
}
