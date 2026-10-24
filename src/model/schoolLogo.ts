import { PoolConnection, type ResultSetHeader, type RowDataPacket } from "mysql2/promise";

// Error
import { InternalServerError } from "../middleware/errors.js";

import { LOGO_CHUNK_BYTES } from "../constant/schoolLogo.js";

export interface SchoolLogoRow {
    schoolInfoId: number;
    image: Buffer;
    mimeType: string;
    byteSize: number;
    updatedBy: number | null;
    updatedAt: Date | string;
}

export default class SchoolLogo {
    constructor(private connection: PoolConnection) {}

    // Fetch the logo metadata for a school_info row, or null when none is
    // saved. The bytes live in school_logo_chunk (or the legacy image column).
    async getLogo(schoolInfoId: number): Promise<SchoolLogoRow | null> {
        try {
            const query = `
                SELECT schoolInfoId, image, mimeType, byteSize, updatedBy, updatedAt
                FROM school_logo
                WHERE schoolInfoId = ?
                LIMIT 1
            `;
            const [rows] = await this.connection.execute<RowDataPacket[]>(query, [schoolInfoId]);
            return rows.length > 0 ? (rows[0] as SchoolLogoRow) : null;
        } catch (err) {
            throw new InternalServerError("Internal Server Error", 500, err);
        }
    }

    // Read the chunked logo bytes in order.
    async getChunks(schoolInfoId: number): Promise<Buffer[]> {
        try {
            const query = `
                SELECT data
                FROM school_logo_chunk
                WHERE schoolInfoId = ?
                ORDER BY chunkIndex ASC
            `;
            const [rows] = await this.connection.execute<RowDataPacket[]>(query, [schoolInfoId]);
            return rows.map((row) => row.data as Buffer);
        } catch (err) {
            throw new InternalServerError("Internal Server Error", 500, err);
        }
    }

    // Insert or update the logo metadata. The image column is intentionally
    // left empty; replaceChunks() stores the actual bytes.
    async upsertLogoMetadata(
        schoolInfoId: number,
        mimeType: string,
        byteSize: number,
        updatedBy: number | null,
    ): Promise<void> {
        try {
            const query = `
                INSERT INTO school_logo (schoolInfoId, image, mimeType, byteSize, updatedBy, updatedAt)
                VALUES (?, '', ?, ?, ?, current_timestamp())
                ON DUPLICATE KEY UPDATE
                    image = '',
                    mimeType = VALUES(mimeType),
                    byteSize = VALUES(byteSize),
                    updatedBy = VALUES(updatedBy),
                    updatedAt = current_timestamp()
            `;
            await this.connection.execute<ResultSetHeader>(query, [
                schoolInfoId,
                mimeType,
                byteSize,
                updatedBy,
            ]);
        } catch (err) {
            throw new InternalServerError("Failed to save the school logo", 500, err);
        }
    }

    // Replace the stored chunks with the supplied image. Each INSERT carries at
    // most LOGO_CHUNK_BYTES, keeping the packet below MySQL's default 1 MB
    // max_allowed_packet even for a 5 MB logo.
    async replaceChunks(schoolInfoId: number, image: Buffer): Promise<void> {
        try {
            await this.connection.execute<ResultSetHeader>(
                "DELETE FROM school_logo_chunk WHERE schoolInfoId = ?",
                [schoolInfoId],
            );

            for (let offset = 0, chunkIndex = 0; offset < image.length; offset += LOGO_CHUNK_BYTES, chunkIndex += 1) {
                const chunk = image.subarray(offset, Math.min(offset + LOGO_CHUNK_BYTES, image.length));
                await this.connection.execute<ResultSetHeader>(
                    "INSERT INTO school_logo_chunk (schoolInfoId, chunkIndex, data) VALUES (?, ?, ?)",
                    [schoolInfoId, chunkIndex, chunk],
                );
            }
        } catch (err) {
            throw new InternalServerError("Failed to save the school logo", 500, err);
        }
    }
}
