import type { PoolConnection } from "mysql2/promise";

import { getDBPoolConnection } from "../config/database.js";
import { InternalServerError } from "../middleware/errors.js";

import SchoolInfoModel from "../model/schoolInfo.js";

import type { SchoolInfoProps, SchoolInfoUpdateProps } from "../constant/schoolInfo.js";

export async function getSchoolInfoService(existingConnection?: PoolConnection): Promise<SchoolInfoProps | null> {
    const pool = getDBPoolConnection();
    const connection = existingConnection ?? await pool.getConnection();
    const ownConnection = !existingConnection;

    try {
        const schoolInfoModel = new SchoolInfoModel(connection);
        return await schoolInfoModel.getSchoolInfo();
    } finally {
        if(ownConnection) {
            connection.release();
        }
    }
}

export async function updateSchoolInfoService(updates: SchoolInfoUpdateProps): Promise<SchoolInfoProps> {
    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        const schoolInfoModel = new SchoolInfoModel(connection);
        // Self-heal: seed a placeholder row when the table is empty (e.g. after
        // a settings wipe) instead of failing every save with 404; the admin's
        // submitted values are applied right after.
        const existing = await schoolInfoModel.ensureSchoolInfo();

        await schoolInfoModel.updateSchoolInfo(existing.id, updates);

        const updated = await schoolInfoModel.getSchoolInfo();
        if (!updated) {
            throw new InternalServerError("School information not found after update", 500);
        }
        return updated;
    } finally {
        connection.release();
    }
}
