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
            const query = "SELECT id, currentQuarter, enrollmentOpen, submissionsLocked FROM academic_settings LIMIT 1";
            const [rows] = await this.connection.execute<RowDataPacket[]>(query);
            return rows.length > 0 ? (rows[0] as AcademicSettingsProps) : null;
        } catch (err) {
            throw new InternalServerError("Internal Server Error", 500, err);
        }
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
