import { PoolConnection, type ResultSetHeader, type RowDataPacket } from "mysql2/promise";

// Error
import { InternalServerError } from "../middleware/errors.js";

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

    // Fetch the school logo (metadata and image buffer) for a school_info row,
    // or null when none is saved.
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

    // Insert or update the school logo directly in a single statement.
    async upsertLogo(
        schoolInfoId: number,
        image: Buffer,
        mimeType: string,
        byteSize: number,
        updatedBy: number | null,
    ): Promise<void> {
        try {
            const query = `
                INSERT INTO school_logo (schoolInfoId, image, mimeType, byteSize, updatedBy, updatedAt)
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
            throw new InternalServerError("Failed to save the school logo", 500, err);
        }
    }
}
