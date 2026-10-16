// `dotenv/config` first — see test/setupEnv.ts for why import order matters.
import "dotenv/config";

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import mysql from "mysql2/promise";
import type { Connection, RowDataPacket } from "mysql2/promise";

import { runMigrations } from "../src/migrations/runner.js";
import { assertSafeTestDatabase, getDbConnectionOptions, getTestDbName } from "./helpers/testConfig.js";

/**
 * Vitest globalSetup — provisions the disposable test database ONCE per run:
 *   1. CREATE DATABASE IF NOT EXISTS <test db>
 *   2. apply the base schema dump (server/gradesync.sql) when not provisioned
 *   3. run the project's file-based migration runner (src/migrations/runner.ts)
 *      against the test DB so the schema matches a migrated production database
 *      (academic_settings.numQuarters, student_academic_records, ...).
 *
 * Steps 2/3 are skipped when the DB is already provisioned, so repeat runs are
 * fast. The runner tracks applied files in schema_migrations, and its migration
 * files are guarded, so the dump + runner is safe to apply to any state.
 */
export default async function globalSetup(): Promise<void> {
    assertSafeTestDatabase();

    const dbName = getTestDbName();
    const options = getDbConnectionOptions();
    const serverDir = fileURLToPath(new URL("..", import.meta.url));

    // 1. Create the database (connect without selecting one).
    const admin = await mysql.createConnection(options);
    try {
        await admin.query(
            `CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci`
        );
    } finally {
        await admin.end();
    }

    // 2. Base schema, when this database has never been provisioned.
    let alreadyProvisioned = false;
    const db = await mysql.createConnection({ ...options, database: dbName, multipleStatements: true });
    try {
        alreadyProvisioned = await isProvisioned(db);
        if (!alreadyProvisioned) {
            console.log(`[test-setup] provisioning disposable test database "${dbName}"…`);
            const schemaSql = readFileSync(new URL("../gradesync.sql", import.meta.url), "utf8");
            await db.query(schemaSql);
        }
    } finally {
        await db.end();
    }

    if (alreadyProvisioned) {
        return;
    }

    // 3. Migrations. The runner is called in-process with an explicit database
    //    name, so it can never re-point at the dev database configured in .env.
    await runMigrations({
        database: dbName,
        migrationsDir: join(serverDir, "migrations"),
        logger: process.env.VITEST_DEBUG_MIGRATE ? (line) => console.log(line) : () => {},
    });

    const verify = await mysql.createConnection({ ...options, database: dbName });
    try {
        if (!(await isProvisioned(verify))) {
            throw new Error(
                `[test-setup] database "${dbName}" is still not provisioned after running migrations.`
            );
        }
    } finally {
        await verify.end();
    }

    console.log("[test-setup] provisioning complete.");
}

/**
 * A database is "provisioned" when the base tables exist AND the migrations have
 * run far enough to provide the columns the fixes depend on
 * (academic_settings.numQuarters is part of the base schema / migrations).
 */
async function isProvisioned(connection: Connection): Promise<boolean> {
    const [tables] = await connection.execute<RowDataPacket[]>(
        `SELECT COUNT(*) AS cnt FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'classrooms'`
    );
    if (Number(tables[0]?.cnt ?? 0) === 0) {
        return false;
    }

    const [columns] = await connection.execute<RowDataPacket[]>(
        `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'academic_settings' AND COLUMN_NAME = 'numQuarters'`
    );
    return Number(columns[0]?.cnt ?? 0) > 0;
}
