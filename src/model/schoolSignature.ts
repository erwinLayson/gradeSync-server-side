import { PoolConnection, type ResultSetHeader, type RowDataPacket } from "mysql2/promise";

// Error
import { InternalServerError } from "../middleware/errors.js";

export interface SchoolSignatureRow {
    schoolInfoId: number;
    image: Buffer;
    mimeType: string;
    byteSize: number;
    updatedBy: number | null;
    updatedAt: Date | string;
}

export default class SchoolSignature {
    constructor(private connection: PoolConnection) {}

    // Fetch the signature for a school_info row, or null when none is saved.
    async getSignature(schoolInfoId: number): Promise<SchoolSignatureRow | null> {
        try {
            const query = `
                SELECT schoolInfoId, image, mimeType, byteSize, updatedBy, updatedAt
                FROM school_signature
                WHERE schoolInfoId = ?
                LIMIT 1
            `;
            const [rows] = await this.connection.execute<RowDataPacket[]>(query, [schoolInfoId]);
            return rows.length > 0 ? (rows[0] as SchoolSignatureRow) : null;
        } catch (err) {
            throw new InternalServerError("Internal Server Error", 500, err);
        }
    }

    // Insert the school's signature or replace the existing one (one row per
    // school, keyed by schoolInfoId).
    async upsertSignature(
        schoolInfoId: number,
        image: Buffer,
        mimeType: string,
        byteSize: number,
        updatedBy: number | null,
    ): Promise<void> {
        try {
            const query = `
                INSERT INTO school_signature (schoolInfoId, image, mimeType, byteSize, updatedBy, updatedAt)
                VALUES (?, ?, ?, ?, ?, current_timestamp())
                ON DUPLICATE KEY UPDATE
                    image = VALUES(image),
                    mimeType = VALUES(mimeType),
                    byteSize = VALUES(byteSize),
                    updatedBy = VALUES(updatedBy),
                    updatedAt = current_timestamp()
            `;
            await this.connection.execute<ResultSetHeader>(query, [
                schoolInfoId,
                image,
                mimeType,
                byteSize,
                updatedBy,
            ]);
        } catch (err) {
            throw new InternalServerError("Failed to save the school signature", 500, err);
        }
    }
}
