import type { PoolConnection } from "mysql2/promise";

import { getDBPoolConnection } from "../config/database.js";
import { BadRequestError, InternalServerError } from "../middleware/errors.js";
import { sniffImageFormat } from "../helper/imageValidation.js";

import SchoolInfoModel from "../model/schoolInfo.js";
import SchoolLogoModel, { type SchoolLogoRow } from "../model/schoolLogo.js";

import { MAX_LOGO_BYTES, type SchoolLogoProps } from "../constant/schoolLogo.js";

function toProps(row: SchoolLogoRow): SchoolLogoProps {
    const updatedAt = row.updatedAt instanceof Date
        ? row.updatedAt.toISOString()
        : new Date(row.updatedAt).toISOString();

    return {
        mimeType: row.mimeType,
        byteSize: row.byteSize,
        updatedAt,
        dataUrl: `data:${row.mimeType};base64,${row.image.toString("base64")}`,
    };
}

// Read the school's saved logo (null when none exists yet).
export async function getSchoolLogoService(existingConnection?: PoolConnection): Promise<SchoolLogoProps | null> {
    const pool = getDBPoolConnection();
    const connection = existingConnection ?? await pool.getConnection();
    const ownConnection = !existingConnection;

    try {
        // This endpoint is public, so never create the school_info placeholder
        // here - a visitor should not be able to write to the database.
        const schoolInfo = await new SchoolInfoModel(connection).getSchoolInfo();
        if (!schoolInfo) return null;

        const logoModel = new SchoolLogoModel(connection);
        const row = await logoModel.getLogo(schoolInfo.id);
        if (!row) return null;

        return toProps(row);
    } finally {
        if (ownConnection) {
            connection.release();
        }
    }
}

export interface SaveSchoolLogoInput {
    buffer: Buffer;
}

// Validate and persist the uploaded logo, replacing any existing one.
export async function saveSchoolLogoService(input: SaveSchoolLogoInput, updatedBy: number | null): Promise<SchoolLogoProps> {
    const { buffer } = input;

    if (buffer.length === 0) {
        throw new BadRequestError("The uploaded logo is empty");
    }
    if (buffer.length > MAX_LOGO_BYTES) {
        throw new BadRequestError(`Logo must be ${MAX_LOGO_BYTES / (1024 * 1024)} MB or smaller`);
    }

    // The declared MIME type is client-controlled; the magic bytes decide.
    const format = sniffImageFormat(buffer);
    if (!format) {
        throw new BadRequestError("Logo must be a valid PNG, JPEG or WebP image");
    }
    const mimeType = `image/${format}`;

    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const schoolInfo = await new SchoolInfoModel(connection).ensureSchoolInfo();
        const logoModel = new SchoolLogoModel(connection);

        await logoModel.upsertLogo(schoolInfo.id, buffer, mimeType, buffer.length, updatedBy);

        const saved = await logoModel.getLogo(schoolInfo.id);
        if (!saved) {
            throw new InternalServerError("Logo was not persisted", 500);
        }

        await connection.commit();
        return toProps(saved);
    } catch (err) {
        await connection.rollback();
        throw err;
    } finally {
        connection.release();
    }
}
