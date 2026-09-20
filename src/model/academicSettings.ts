import { PoolConnection, type ResultSetHeader, type RowDataPacket } from "mysql2/promise";

// Error
import { InternalServerError } from "../middleware/errors.js";

// Types
import type { AcademicSettingsProps, AcademicSettingsUpdateProps } from "../constant/academicSettings.js";
import { AllowedAcademicSettingFields } from "../constant/academicSettings.js";

export default class AcademicSettings {
    constructor(private connection: PoolConnection) {}

    async getSettings(): Promise<AcademicSettingsProps | null> {
        try {
            const query = "SELECT id, currentQuarter, numQuarters, enrollmentOpen, submissionsLocked FROM academic_settings LIMIT 1";
            const [rows] = await this.connection.execute<RowDataPacket[]>(query);
            return rows.length > 0 ? (rows[0] as AcademicSettingsProps) : null;
        } catch (err) {
            throw new InternalServerError("Internal Server Error", 500, err);
        }
    }

    // Return the single settings row, seeding the default row (quarter 1, 4
    // quarters, enrollment open, submissions unlocked — same defaults as
    // migrate_all.mjs) when the table is empty. The migration only seeds on
    // CREATE TABLE, so an emptied table (e.g. after a settings wipe) would
    // otherwise leave every admin settings save stuck on a 404 forever.
    async ensureSettings(): Promise<AcademicSettingsProps> {
        const existing = await this.getSettings();
        if (existing) return existing;

        await this.connection.execute<ResultSetHeader>(
            "INSERT INTO academic_settings(currentQuarter, numQuarters, enrollmentOpen, submissionsLocked) VALUES(1, 4, 1, 0)"
        );

        const seeded = await this.getSettings();
        if (!seeded) {
            throw new InternalServerError("Failed to create the default academic settings row", 500);
        }
        return seeded;
    }

    async updateSettings(id: number, updates: AcademicSettingsUpdateProps): Promise<void> {
        const updateFields: string[] = [];
        const values: (string | number)[] = [];

        for (const field of AllowedAcademicSettingFields) {
            if (field in updates) {
                updateFields.push(`${field} = ?`);
                values.push((updates as any)[field]);
            }
        }

        if (updateFields.length === 0) {
            return;
        }

        try {
            const query = `UPDATE academic_settings SET ${updateFields.join(", ")} WHERE id = ?`;
            await this.connection.execute<ResultSetHeader>(query, [...values, id]);
        } catch (err) {
            throw new InternalServerError("Failed to update academic settings", 500, err);
        }
    }
}
