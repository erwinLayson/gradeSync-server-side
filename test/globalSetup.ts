// `dotenv/config` first — see test/setupEnv.ts for why import order matters.
import "dotenv/config";

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import mysql from "mysql2/promise";
import type { Connection, RowDataPacket } from "mysql2/promise";

import { assertSafeTestDatabase, getDbConnectionOptions, getTestDbName } from "./helpers/testConfig.js";

/**
 * Vitest globalSetup — provisions the disposable test database ONCE per run:
 *   1. CREATE DATABASE IF NOT EXISTS <test db>
 *   2. apply the base schema dump (server/gradesync.sql) when not provisioned
 *   3. run the project's consolidated migration runner (server/migrate_all.mjs)
 *      against the test DB so the schema matches a migrated production database
 *      (academic_settings.numQuarters, student_academic_records, ...).
 *
 * Steps 2/3 are skipped when the DB is already provisioned, so repeat runs are
 * fast. migrate_all.mjs is idempotent, but the raw dump is not (no
 * IF NOT EXISTS), hence the guard.
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

    // 3. Migrations. Run as a child process so migrate_all.mjs' own
    //    `dotenv/config` cannot re-point the connection at the dev database.
    execFileSync(process.execPath, ["migrate_all.mjs"], {
        cwd: serverDir,
        env: { ...process.env, DB_NAME: dbName, NODE_ENV: "development" },
        stdio: process.env.VITEST_DEBUG_MIGRATE ? "inherit" : "pipe",
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
 * (academic_settings.numQuarters is added by migrate_all step 8).
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
