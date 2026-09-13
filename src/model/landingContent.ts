import { PoolConnection, type ResultSetHeader, type RowDataPacket } from "mysql2/promise";

import { InternalServerError, NotFoundError } from "../middleware/errors.js";

import type { LandingContentRow, LandingSectionContent } from "../constant/landingContent.js";

interface LandingContentDbRow extends RowDataPacket {
    section: string;
    content: string | LandingSectionContent;
    updatedBy: number | null;
    updatedAt: string | null;
}

export default class LandingContent {
    constructor(private connection: PoolConnection) {}

    async getAll(): Promise<LandingContentRow[]> {
        try {
            const query = "SELECT section, content, updatedBy, updatedAt FROM landing_content ORDER BY id";
            const [rows] = await this.connection.execute<LandingContentDbRow[]>(query);
            return rows.map(LandingContent.toProps);
        } catch (err) {
            throw new InternalServerError("Internal Server Error", 500, err);
        }
    }

    async getBySection(section: string): Promise<LandingContentRow | null> {
        try {
            const query = "SELECT section, content, updatedBy, updatedAt FROM landing_content WHERE section = ?";
            const [rows] = await this.connection.execute<LandingContentDbRow[]>(query, [section]);
            const row = rows[0];
            return row ? LandingContent.toProps(row) : null;
        } catch (err) {
            throw new InternalServerError("Internal Server Error", 500, err);
        }
    }

    // Insert-or-update by section; used by the seeder and migrations so
    // re-seeding refreshes content instead of failing on the unique key.
    async upsert(section: string, content: LandingSectionContent): Promise<void> {
        try {
            const query = `
                INSERT INTO landing_content (section, content)
                VALUES (?, ?)
                ON DUPLICATE KEY UPDATE content = VALUES(content)`;
            await this.connection.execute<ResultSetHeader>(query, [section, JSON.stringify(content)]);
        } catch (err) {
            throw new InternalServerError("Failed to upsert landing content", 500, err);
        }
    }

    // Updates a section and records who changed it (audit, same as features).
    // Throws NotFoundError when the section does not exist (404).
    async updateSection(
        section: string,
        content: LandingSectionContent,
        updatedBy: number,
    ): Promise<LandingContentRow> {
        try {
            const query = "UPDATE landing_content SET content = ?, updatedBy = ?, updatedAt = NOW() WHERE section = ?";
            const [result] = await this.connection.execute<ResultSetHeader>(query, [
                JSON.stringify(content),
                updatedBy,
                section,
            ]);

            if (result.affectedRows === 0) {
                throw new NotFoundError("Landing section not found", 404);
            }

            const updated = await this.getBySection(section);
            if (!updated) {
                throw new NotFoundError("Landing section not found after update", 404);
            }
            return updated;
        } catch (err) {
            if (err instanceof NotFoundError) throw err;
            throw new InternalServerError("Failed to update landing content", 500, err);
        }
    }

    private static toProps(row: LandingContentDbRow): LandingContentRow {
        let content: LandingSectionContent;
        try {
            // mysql2 returns JSON columns as parsed objects; a TEXT fallback
            // (pre-migration rows, manual inserts) is parsed defensively.
            content =
                typeof row.content === "string"
                    ? (JSON.parse(row.content) as LandingSectionContent)
                    : row.content;
        } catch {
            throw new InternalServerError("Landing content is not valid JSON", 500);
        }

        return {
            section: row.section,
            content,
            updatedBy: row.updatedBy,
            updatedAt: row.updatedAt,
        };
    }
}
