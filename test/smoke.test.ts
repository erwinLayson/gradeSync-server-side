import { describe, expect, it } from "vitest";

import { getDBPoolConnection } from "../src/config/database.js";
import { getTestDbName } from "./helpers/testConfig.js";

/**
 * Infrastructure smoke test: proves the runner executes, globalSetup provisioned
 * the disposable database, setupEnv repointed the app pool, and the migrated
 * schema is present.
 */
describe("test infrastructure", () => {
    it("points the application pool at the disposable test database", async () => {
        const connection = await getDBPoolConnection().getConnection();
        try {
            const [rows] = await connection.query("SELECT DATABASE() AS db");
            const db = (rows as { db: string }[])[0]?.db;
            expect(db).toBe(getTestDbName());
            // Safety: the pool is on a dedicated disposable *_test database.
            expect(db).toContain("_test");
        } finally {
            connection.release();
        }
    });

    it("has the migrated schema the fixes rely on", async () => {
        const connection = await getDBPoolConnection().getConnection();
        try {
            const [recordColumns] = await connection.query(
                `SELECT COLUMN_NAME FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student_academic_records'`
            );
            const names = (recordColumns as { COLUMN_NAME: string }[]).map((r) => r.COLUMN_NAME);
            expect(names).toContain("classSection");
            expect(names).toContain("classGradeLevel");
            expect(names).toContain("adviserName");

            const [subjectColumns] = await connection.query(
                `SELECT COLUMN_NAME FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'student_academic_record_subjects'`
            );
            const subjectNames = (subjectColumns as { COLUMN_NAME: string }[]).map((r) => r.COLUMN_NAME);
            // Migration step 12: name/code snapshots replace the subjectId FK.
            expect(subjectNames).toContain("subjectName");
            expect(subjectNames).toContain("subjectCode");
            expect(subjectNames).not.toContain("subjectId");
        } finally {
            connection.release();
        }
    });
});
