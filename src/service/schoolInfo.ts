import type { PoolConnection } from "mysql2/promise";

import { getDBPoolConnection } from "../config/database.js";
import { NotFoundError } from "../middleware/errors.js";

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
        const existing = await schoolInfoModel.getSchoolInfo();
        if (!existing) {
            throw new NotFoundError("School information not found", 404);
        }

        await schoolInfoModel.updateSchoolInfo(existing.id, updates);

        const updated = await schoolInfoModel.getSchoolInfo();
        if (!updated) {
            throw new NotFoundError("School information not found after update", 404);
        }
        return updated;
    } finally {
        connection.release();
    }
}
