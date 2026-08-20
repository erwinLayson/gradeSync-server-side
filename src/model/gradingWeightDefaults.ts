import { PoolConnection, type ResultSetHeader, type RowDataPacket } from "mysql2/promise";

// Error
import { InternalServerError } from "../middleware/errors.js";

// Types
import type { GradingWeightDefaultsProps, GradingWeightDefaultsUpdateProps } from "../constant/gradingWeightDefaults.js";
import { AllowedGradingWeightDefaultFields } from "../constant/gradingWeightDefaults.js";

export default class GradingWeightDefaults {
    constructor(private connection: PoolConnection) {}

    // Fetch the single default-weights row.
    async getDefaults(): Promise<GradingWeightDefaultsProps | null> {
        try {
            const query = `
                SELECT id, writtenWorkWeight, performanceTaskWeight, quarterlyAssessmentWeight, attendanceWeight
                FROM grading_weight_defaults
                LIMIT 1
            `;
            const [rows] = await this.connection.execute<RowDataPacket[]>(query);
            return rows.length > 0 ? (rows[0] as GradingWeightDefaultsProps) : null;
        } catch (err) {
            throw new InternalServerError("Internal Server Error", 500, err);
        }
    }

    // Update the editable weight columns of the defaults row.
    async updateDefaults(id: number, updates: GradingWeightDefaultsUpdateProps): Promise<void> {
        const updateFields: string[] = [];
        const values: (string | number)[] = [];

        for (const field of AllowedGradingWeightDefaultFields) {
            if (field in updates) {
                updateFields.push(`${field} = ?`);
                values.push((updates as any)[field]);
            }
        }

        if (updateFields.length === 0) {
            return;
        }

        try {
            const query = `UPDATE grading_weight_defaults SET ${updateFields.join(", ")} WHERE id = ?`;
            await this.connection.execute<ResultSetHeader>(query, [...values, id]);
        } catch (err) {
            throw new InternalServerError("Failed to update grading weight defaults", 500, err);
        }
    }
}
