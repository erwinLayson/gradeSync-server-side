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

    // Return the single school-info row, seeding a placeholder row when the
    // table is empty. The migration seeds this table only on CREATE TABLE (and
    // dev seed.ts), so an emptied table (e.g. after a settings wipe) would
    // otherwise leave every admin settings save stuck on a 404 forever. The
    // placeholder satisfies the NOT NULL columns; the admin's next save
    // replaces it with the real values.
    async ensureSchoolInfo(): Promise<SchoolInfoProps> {
        const existing = await this.getSchoolInfo();
        if (existing) return existing;

        await this.connection.execute<ResultSetHeader>(
            "INSERT INTO school_info(schoolId, name, district, division, region) VALUES(0, '', '', '', '')"
        );

        const seeded = await this.getSchoolInfo();
        if (!seeded) {
            throw new InternalServerError("Failed to create the school information row", 500);
        }
        return seeded;
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
