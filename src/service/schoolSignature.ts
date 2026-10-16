import type { PoolConnection } from "mysql2/promise";

import { getDBPoolConnection } from "../config/database.js";
import { BadRequestError, InternalServerError } from "../middleware/errors.js";
import { sniffImageFormat } from "../helper/imageValidation.js";

import SchoolInfoModel from "../model/schoolInfo.js";
import SchoolSignatureModel, { type SchoolSignatureRow } from "../model/schoolSignature.js";

import { MAX_SIGNATURE_BYTES, type SchoolSignatureProps } from "../constant/schoolSignature.js";

function toProps(row: SchoolSignatureRow): SchoolSignatureProps {
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

// Read the school's saved signature (null when none exists yet).
export async function getSchoolSignatureService(existingConnection?: PoolConnection): Promise<SchoolSignatureProps | null> {
    const pool = getDBPoolConnection();
    const connection = existingConnection ?? await pool.getConnection();
    const ownConnection = !existingConnection;

    try {
        const schoolInfo = await new SchoolInfoModel(connection).ensureSchoolInfo();
        const row = await new SchoolSignatureModel(connection).getSignature(schoolInfo.id);
        return row ? toProps(row) : null;
    } finally {
        if (ownConnection) {
            connection.release();
        }
    }
}

export interface SaveSchoolSignatureInput {
    buffer: Buffer;
}

// Validate and persist the uploaded signature, replacing any existing one.
export async function saveSchoolSignatureService(input: SaveSchoolSignatureInput, updatedBy: number | null): Promise<SchoolSignatureProps> {
    const { buffer } = input;

    if (buffer.length === 0) {
        throw new BadRequestError("The uploaded signature is empty");
    }
    if (buffer.length > MAX_SIGNATURE_BYTES) {
        throw new BadRequestError(`Signature must be ${MAX_SIGNATURE_BYTES / (1024 * 1024)} MB or smaller`);
    }

    // The declared MIME type is client-controlled; the magic bytes decide.
    const format = sniffImageFormat(buffer);
    if (!format) {
        throw new BadRequestError("Signature must be a valid PNG, JPEG or WebP image");
    }
    const mimeType = `image/${format}`;

    const pool = getDBPoolConnection();
    const connection = await pool.getConnection();
    try {
        const schoolInfo = await new SchoolInfoModel(connection).ensureSchoolInfo();
        const signatureModel = new SchoolSignatureModel(connection);

        await signatureModel.upsertSignature(schoolInfo.id, buffer, mimeType, buffer.length, updatedBy);

        const saved = await signatureModel.getSignature(schoolInfo.id);
        if (!saved) {
            throw new InternalServerError("Signature was not persisted", 500);
        }
        return toProps(saved);
    } finally {
        connection.release();
    }
}
