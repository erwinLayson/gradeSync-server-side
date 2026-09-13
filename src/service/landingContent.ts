import { getDBPoolConnection } from "../config/database.js";

import LandingContentModel from "../model/landingContent.js";

import type {
    LandingContentMap,
    LandingContentRow,
    LandingSectionContent,
} from "../constant/landingContent.js";

// GET /landing-content — the public map consumed by the landing page.
export async function getLandingContentService(): Promise<LandingContentMap> {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        const model = new LandingContentModel(connection);
        const rows = await model.getAll();
        const map: LandingContentMap = {};
        for (const row of rows) {
            map[row.section] = row.content;
        }
        return map;
    } finally {
        connection.release();
    }
}

// PATCH /landing-content/:section — developer only (enforced by route middleware).
export async function updateLandingSectionService(
    section: string,
    content: LandingSectionContent,
    updatedBy: number,
): Promise<LandingContentRow> {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        const model = new LandingContentModel(connection);
        return await model.updateSection(section, content, updatedBy);
    } finally {
        connection.release();
    }
}
