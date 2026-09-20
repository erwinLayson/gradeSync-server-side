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

    // Return the single defaults row, seeding the DepEd DO 8 s. 2015 default
    // weights (20/60/20/0 — same values as migrate_all.mjs) when the table is
    // empty. The migration seeds only on CREATE TABLE, so an emptied table
    // (e.g. after a settings wipe) would otherwise wedge the weights form on
    // a 404 forever.
    async ensureDefaults(): Promise<GradingWeightDefaultsProps> {
        const existing = await this.getDefaults();
        if (existing) return existing;

        await this.connection.execute<ResultSetHeader>(
            "INSERT INTO grading_weight_defaults(writtenWorkWeight, performanceTaskWeight, quarterlyAssessmentWeight, attendanceWeight) VALUES(20.00, 60.00, 20.00, 0.00)"
        );

        const seeded = await this.getDefaults();
        if (!seeded) {
            throw new InternalServerError("Failed to create the default grading weights row", 500);
        }
        return seeded;
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
