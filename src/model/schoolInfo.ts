import { PoolConnection, type ResultSetHeader, type RowDataPacket } from "mysql2/promise";

// Error
import { InternalServerError } from "../middleware/errors.js";

// Types
import type { SchoolInfoProps, SchoolInfoUpdateProps } from "../constant/schoolInfo.js";
import { AllowedSchoolInfoFields } from "../constant/schoolInfo.js";

export default class SchoolInfo {
    constructor(private connection: PoolConnection) {}

    // Fetch the single school information row.
    async getSchoolInfo(): Promise<SchoolInfoProps | null> {
        try {
            const query = `
                SELECT id, schoolId, name, district, division, region, principal, address
                FROM school_info
                LIMIT 1
            `;
            const [rows] = await this.connection.execute<RowDataPacket[]>(query);
            return rows.length > 0 ? (rows[0] as SchoolInfoProps) : null;
        } catch (err) {
            throw new InternalServerError("Internal Server Error", 500, err);
        }
    }

    // Update the editable fields of the school information row.
    async updateSchoolInfo(id: number, updates: SchoolInfoUpdateProps): Promise<void> {
        const updateFields: string[] = [];
        const values: (string | number | null)[] = [];

        for (const field of AllowedSchoolInfoFields) {
            if (field in updates) {
                updateFields.push(`${field} = ?`);
                values.push((updates as any)[field]);
            }
        }

        if (updateFields.length === 0) {
            return;
        }

        try {
            const query = `UPDATE school_info SET ${updateFields.join(", ")} WHERE id = ?`;
            await this.connection.execute<ResultSetHeader>(query, [...values, id]);
        } catch (err) {
            throw new InternalServerError("Failed to update school information", 500, err);
        }
    }
}
