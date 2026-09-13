import { PoolConnection, type ResultSetHeader, type RowDataPacket } from "mysql2/promise";

import { InternalServerError, NotFoundError } from "../middleware/errors.js";

import type { FeatureProps } from "../constant/features.js";

interface FeatureDbRow extends RowDataPacket {
    key: string;
    label: string;
    description: string | null;
    enabled: number;
    updatedBy: number | null;
    updatedAt: string | null;
}

export default class Features {
    constructor(private connection: PoolConnection) {}

    async getAll(): Promise<FeatureProps[]> {
        try {
            const query = "SELECT `key`, label, description, enabled, updatedBy, updatedAt FROM features ORDER BY label";
            const [rows] = await this.connection.execute<FeatureDbRow[]>(query);
            return rows.map(Features.toProps);
        } catch (err) {
            throw new InternalServerError("Internal Server Error", 500, err);
        }
    }

    async getByKey(key: string): Promise<FeatureProps | null> {
        try {
            const query = "SELECT `key`, label, description, enabled, updatedBy, updatedAt FROM features WHERE `key` = ?";
            const [rows] = await this.connection.execute<FeatureDbRow[]>(query, [key]);
            const row = rows[0];
            return row ? Features.toProps(row) : null;
        } catch (err) {
            throw new InternalServerError("Internal Server Error", 500, err);
        }
    }

    // Insert-or-update by key; used by the seeder so re-seeding updates
    // labels instead of failing on the unique key.
    async upsert(feature: { key: string; label: string; description: string }): Promise<void> {
        try {
            const query = `
                INSERT INTO features (\`key\`, label, description, enabled)
                VALUES (?, ?, ?, 1)
                ON DUPLICATE KEY UPDATE label = VALUES(label), description = VALUES(description)`;
            await this.connection.execute<ResultSetHeader>(query, [feature.key, feature.label, feature.description]);
        } catch (err) {
            throw new InternalServerError("Failed to upsert feature", 500, err);
        }
    }

    // Toggles a feature and records who changed it (audit trail, plan §6.3).
    // Throws NotFoundError when the key does not exist (plan §3.3: 404).
    async setEnabled(key: string, enabled: boolean, updatedBy: number): Promise<FeatureProps> {
        try {
            const query = "UPDATE features SET enabled = ?, updatedBy = ?, updatedAt = NOW() WHERE `key` = ?";
            const [result] = await this.connection.execute<ResultSetHeader>(query, [enabled ? 1 : 0, updatedBy, key]);

            if (result.affectedRows === 0) {
                throw new NotFoundError("Feature not found", 404);
            }

            const updated = await this.getByKey(key);
            if (!updated) {
                throw new NotFoundError("Feature not found after update", 404);
            }
            return updated;
        } catch (err) {
            if (err instanceof NotFoundError) throw err;
            throw new InternalServerError("Failed to update feature", 500, err);
        }
    }

    private static toProps(row: FeatureDbRow): FeatureProps {
        return {
            key: row.key,
            label: row.label,
            description: row.description,
            enabled: Number(row.enabled) === 1,
            updatedBy: row.updatedBy,
            updatedAt: row.updatedAt,
        };
    }
}
