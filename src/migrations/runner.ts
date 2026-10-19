import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import mysql from "mysql2/promise";
import type { Connection, RowDataPacket } from "mysql2/promise";

/**
 * File-based migration runner.
 *
 * Reads every `.sql` file in the migrations directory (applied in filename
 * order), applies the pending ones against the database configured in the
 * environment, and records each applied file in `schema_migrations` so a file
 * runs exactly once and re-runs are a no-op. Migration files are written with
 * `CREATE TABLE IF NOT EXISTS` / guarded inserts, so they are also safe to run
 * against a database that already has the change.
 *
 * `migrations/` sits next to both `src/` and the compiled `dist/`, so the
 * default URL below resolves identically whether this module runs via `tsx`
 * from `src/` or as emitted JavaScript from `dist/`.
 */
const DEFAULT_MIGRATIONS_DIR = fileURLToPath(new URL("../../migrations/", import.meta.url));

export interface RunMigrationsOptions {
    /** Target database. Defaults to the `DB_NAME` environment variable. */
    database?: string;
    /** Folder holding the `.sql` files. Defaults to `server/migrations/`. */
    migrationsDir?: string;
    /** Mark pending files as applied WITHOUT executing them. */
    baseline?: boolean;
    /** Drop all existing tables before running migrations (fresh start). */
    fresh?: boolean;
    /** Sink for progress output. Defaults to `console.log`. */
    logger?: (line: string) => void;
}

export async function runMigrations(options: RunMigrationsOptions = {}): Promise<void> {
    const log = options.logger ?? ((line: string) => console.log(line));
    const database = options.database ?? process.env.DB_NAME;
    const migrationsDir = options.migrationsDir ?? DEFAULT_MIGRATIONS_DIR;

    if (!database) {
        throw new Error("DB_NAME is not set; cannot run migrations.");
    }

    const host = process.env.DB_HOST ?? "localhost";

    const connection = await mysql.createConnection({
        host,
        port: Number(process.env.DB_PORT ?? 3306),
        user: process.env.DB_USER ?? "root",
        password: process.env.DB_PASSWORD ?? "",
        database,
        // A migration file may hold several statements, so multi-statement mode
        // is required.
        multipleStatements: true,
        // TiDB Cloud requires TLS. Same convention as src/config/database.ts:
        // SSL when NODE_ENV=production (set in the deploy environment).
        ...(process.env.NODE_ENV === "production" && {
            ssl: { rejectUnauthorized: true },
        }),
    });

    try {
        log(`Target database: ${database} @ ${host}\n`);

        if (options.fresh) {
            await dropAllDatabaseTables(connection, database, log);
        }

        await ensureMigrationsTable(connection);
        const applied = await appliedMigrations(connection);
        const files = await migrationFiles(migrationsDir);

        if (files.length === 0) {
            log(`No migration files found in ${migrationsDir}.`);
        }

        const pending = files.filter((file) => !applied.has(nameOf(file)));

        if (options.baseline) {
            for (const file of pending) {
                await recordMigration(connection, nameOf(file));
                log(`  baselined (not run): ${file}`);
            }
            log(`\nBaselined ${pending.length} migration(s); nothing was executed.`);
            return;
        }

        let ran = 0;
        for (const file of files) {
            const name = nameOf(file);
            if (applied.has(name)) {
                log(`  skip (already applied): ${file}`);
                continue;
            }

            log(`  apply: ${file}`);
            const sql = await readFile(join(migrationsDir, file), "utf8");
            await connection.query(sql);
            await recordMigration(connection, name);
            ran += 1;
        }

        log(
            ran === 0
                ? "\nNothing to do — database is up to date."
                : `\nApplied ${ran} migration(s) successfully.`
        );
    } finally {
        await connection.end();
    }
}

function nameOf(file: string): string {
    return file.replace(/\.sql$/, "");
}

async function ensureMigrationsTable(connection: Connection): Promise<void> {
    await connection.query(`
        CREATE TABLE IF NOT EXISTS \`schema_migrations\` (
          \`id\` int(11) NOT NULL AUTO_INCREMENT,
          \`name\` varchar(255) NOT NULL,
          \`applied_at\` timestamp NOT NULL DEFAULT current_timestamp(),
          PRIMARY KEY (\`id\`),
          UNIQUE KEY \`schema_migrations_name_unique\` (\`name\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);
}

async function appliedMigrations(connection: Connection): Promise<Set<string>> {
    const [rows] = await connection.query<RowDataPacket[]>("SELECT `name` FROM `schema_migrations`");
    return new Set(rows.map((row) => String(row.name)));
}

async function migrationFiles(dir: string): Promise<string[]> {
    const entries = await readdir(dir);
    return entries.filter((name) => name.endsWith(".sql")).sort();
}

async function recordMigration(connection: Connection, name: string): Promise<void> {
    await connection.query("INSERT INTO `schema_migrations` (`name`) VALUES (?)", [name]);
}

async function dropAllDatabaseTables(
    connection: Connection,
    database: string,
    log: (line: string) => void
): Promise<void> {
    log(`Fresh migration: dropping all existing tables/views in \`${database}\`...`);
    await connection.query("SET FOREIGN_KEY_CHECKS = 0");
    try {
        const [rows] = await connection.query<RowDataPacket[]>(
            `SELECT TABLE_NAME AS name, TABLE_TYPE AS type
             FROM information_schema.TABLES
             WHERE TABLE_SCHEMA = ?`,
            [database]
        );

        if (rows.length === 0) {
            log("  No existing tables found to drop.\n");
            return;
        }

        for (const row of rows) {
            const name = String(row.name);
            const type = String(row.type);
            if (type === "VIEW") {
                await connection.query(`DROP VIEW IF EXISTS \`${name}\``);
            } else {
                await connection.query(`DROP TABLE IF EXISTS \`${name}\``);
            }
            log(`  dropped: ${name}`);
        }
        log(`\nDropped ${rows.length} existing table(s)/view(s). Starting clean migration...\n`);
    } finally {
        await connection.query("SET FOREIGN_KEY_CHECKS = 1");
    }
}
