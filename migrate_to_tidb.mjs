// ============================================================================
// migrate_to_tidb.mjs — one-command MySQL → TiDB migration
//
// Copies the full schema and data from the MySQL database configured in .env
// (DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME) into a TiDB database,
// with no manual dump/import steps. TiDB speaks the MySQL protocol, so the
// same mysql2 driver is used on both ends.
//
// Target configuration (env vars):
//   TIDB_HOST       required — e.g. gateway01.<region>.prod.aws.tidbcloud.com
//                              or 127.0.0.1 for a local tiup playground
//   TIDB_PORT       optional — default 4000 (TiDB's default, not MySQL's 3306)
//   TIDB_USER       required — e.g. <user>.root on TiDB Cloud
//   TIDB_PASSWORD   optional — if unset/empty, falls back to the existing
//                              DEFAULT_PASSWORD default, then to an empty
//                              password; pass --require-password to abort
//                              instead of using a fallback
//   TIDB_DATABASE   required — target database name
//   TIDB_SSL        optional — TLS is ON by default (TiDB Cloud requires it).
//                              Set TIDB_SSL=0 for local/self-hosted clusters.
//
//   What if the target creds live under DB_* in the production env?
//   Pass --target-env=<path> (or TIDB_ENV_FILE) to an env file that holds the
//   TiDB connection in its DB_* variables (e.g. gradeSync-server-side.env).
//   Its DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME define the TIDB_* target;
//   any TIDB_* values from the CWD .env are overridden except an empty
//   DB_PASSWORD, which keeps the DEFAULT_PASSWORD fallback.
//
// Flags:
//   --drop           DROP TABLE IF EXISTS on the target before copying (fresh load)
//   --create-db      CREATE DATABASE IF NOT EXISTS on the target first
//   --schema-only    create tables, skip data
//   --verify-only    compare row counts and exit (no writes)
//   --tables=a,b     migrate only these tables (comma-separated)
//   --batch-size=N   rows per INSERT batch (default 500)
//   --force          allow running when source and target look identical
//   --require-password  abort when TIDB_PASSWORD is not explicitly set
//   --target-env=PATH   load target credentials (DB_* -> TIDB_*) from another
//                       env file; alias: TIDB_ENV_FILE
//
// How it works:
//   1. Discovers every BASE TABLE in the source schema (views are skipped).
//   2. Recreates each table on TiDB from SHOW CREATE TABLE. The target session
//      runs with FOREIGN_KEY_CHECKS=0 so table order never matters; note that
//      TiDB versions before v6.6 parse but do not enforce foreign keys.
//   3. Streams rows out of MySQL and bulk-inserts into TiDB in batches,
//      ordered by primary key for a deterministic load.
//   4. Syncs AUTO_INCREMENT counters from the source.
//   5. Verifies per-table row counts; exits non-zero on any mismatch.
//
// Usage: from the server directory -> `npm run migrate:tidb`
//   e.g. `node migrate_to_tidb.mjs --verify-only --target-env=gradeSync-server-side.env`
// ============================================================================

import "dotenv/config";
import fs from "node:fs";
import mysql from "mysql2/promise";

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);

const hasFlag = (name) => args.includes(name);

function flagValue(name, fallback) {
    const prefix = `${name}=`;
    const match = args.find((arg) => arg.startsWith(prefix));
    return match ? match.slice(prefix.length) : fallback;
}

const OPT_DROP = hasFlag("--drop");
const OPT_CREATE_DB = hasFlag("--create-db");
const OPT_SCHEMA_ONLY = hasFlag("--schema-only");
const OPT_VERIFY_ONLY = hasFlag("--verify-only");
const OPT_FORCE = hasFlag("--force");
const OPT_REQUIRE_PASSWORD = hasFlag("--require-password");
const OPT_TABLES = flagValue("--tables", null);
const BATCH_SIZE = Math.max(1, Number(flagValue("--batch-size", "500")) || 500);

const ONLY_TABLES = OPT_TABLES
    ? OPT_TABLES.split(",").map((t) => t.trim()).filter(Boolean)
    : null;

// --target-env=<path> (or TIDB_ENV_FILE) loads ANOTHER env file's DB_* variables
// as the TiDB target. That lets the migration run with a local MySQL source
// (the .env in the CWD) and, say, the live production TiDB — whose credentials
// live under DB_* in a named env like gradeSync-server-side.env — as the target,
// without copying production secrets into the dev .env.
const TARGET_ENV_FILE = flagValue("--target-env", process.env.TIDB_ENV_FILE);

const TARGET_ENV_MAP = {
    DB_HOST: "TIDB_HOST",
    DB_PORT: "TIDB_PORT",
    DB_USER: "TIDB_USER",
    DB_PASSWORD: "TIDB_PASSWORD",
    DB_NAME: "TIDB_DATABASE",
};

// Runs before SRC/TGT are built. When --target-env is given, the file's DB_*
// values define the TIDB_* target outright — any TIDB_* values already loaded
// from the CWD .env (e.g. placeholder values) are overridden, so a named
// production env cannot be shadowed by a dev .env.
function applyTargetEnvOverrides() {
    if (!TARGET_ENV_FILE) return;
    if (!fs.existsSync(TARGET_ENV_FILE)) {
        console.error(`--target-env file not found: ${TARGET_ENV_FILE}`);
        process.exit(1);
    }

    const source = fs.readFileSync(TARGET_ENV_FILE, "utf8");
    for (const rawLine of source.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith("#")) continue;
        const eq = line.indexOf("=");
        if (eq === -1) continue;
        const key = line.slice(0, eq).trim();
        const targetKey = TARGET_ENV_MAP[key];
        if (!targetKey) continue;

        const value = line.slice(eq + 1).trim();
        // Don't map an empty target password — that would disable the
        // DEFAULT_PASSWORD fallback chain.
        if (targetKey === "TIDB_PASSWORD" && value === "") continue;

        process.env[targetKey] = value;
    }
    console.log(`Target credentials loaded from --target-env ${TARGET_ENV_FILE}`);
}

applyTargetEnvOverrides();

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const SRC = {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    connectTimeout: 30000,
    // Read DATETIME/TIMESTAMP as raw strings so values survive the round-trip
    // exactly (also avoids throwing on zero-dates like 0000-00-00).
    dateStrings: true,
};

const TIDB_SSL = process.env.TIDB_SSL !== "0";

// TiDB password resolution: an explicit TIDB_PASSWORD always wins, otherwise
// the existing DEFAULT_PASSWORD env default is used, otherwise an empty
// password. Only the chosen source is ever logged — never the value itself.
function resolvePassword() {
    const explicit = process.env.TIDB_PASSWORD;
    const fallback = process.env.DEFAULT_PASSWORD;
    if (explicit !== undefined && explicit !== "") {
        return { value: explicit, source: "set" };
    }
    if (fallback !== undefined && fallback !== "") {
        return { value: fallback, source: "defaulted" };
    }
    return { value: "", source: "empty" };
}

const PASSWORD_RESULT = resolvePassword();

const TGT = {
    host: process.env.TIDB_HOST,
    port: Number(process.env.TIDB_PORT || 4000),
    user: process.env.TIDB_USER,
    password: PASSWORD_RESULT.value,
    database: process.env.TIDB_DATABASE,
    connectTimeout: 30000,
    dateStrings: true,
    // TiDB Cloud requires TLS; self-hosted clusters can opt out with TIDB_SSL=0.
    ...(TIDB_SSL ? { ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true } } : {}),
};

function requireEnv(value, label, hint) {
    if (!value) {
        console.error(`Missing required env var: ${label}${hint ? ` — ${hint}` : ""}`);
        process.exit(1);
    }
    return value;
}

function validateConfig() {
    requireEnv(SRC.host, "DB_HOST");
    requireEnv(SRC.user, "DB_USER");
    requireEnv(SRC.database, "DB_NAME");

    const targetHint =
        `set TIDB_* in the env file or pass --target-env=<production env file> ` +
        `(e.g. --target-env=gradeSync-server-side.env)`;
    requireEnv(TGT.host, "TIDB_HOST", targetHint);
    requireEnv(TGT.user, "TIDB_USER", targetHint);
    requireEnv(TGT.database, "TIDB_DATABASE", targetHint);

    if (OPT_REQUIRE_PASSWORD && PASSWORD_RESULT.source !== "set") {
        console.error(
            "--require-password was set but TIDB_PASSWORD is not explicitly configured " +
            `(password resolved from ${PASSWORD_RESULT.source}).`
        );
        process.exit(1);
    }

    // Hard guard: refuse to migrate a database onto itself (would DROP the source).
    const sameTarget =
        SRC.host === TGT.host &&
        Number(SRC.port) === Number(TGT.port) &&
        SRC.database === TGT.database;
    if (sameTarget && !OPT_FORCE) {
        console.error(
            `Source and target are identical (${SRC.host}:${SRC.port}/${SRC.database}).\n` +
            "This would destroy the source database. Use --force only if you really mean it."
        );
        process.exit(1);
    }
}

function logConfig() {
    console.log("Source  :", `${SRC.host}:${SRC.port}/${SRC.database} (user ${SRC.user})`);
    console.log("Target  :", `${TGT.host}:${TGT.port}/${TGT.database} (user ${TGT.user}, TLS ${TIDB_SSL ? "on" : "off"}, password ${PASSWORD_RESULT.source})`);
    console.log("Options :", [
        OPT_DROP && "--drop",
        OPT_CREATE_DB && "--create-db",
        OPT_SCHEMA_ONLY && "--schema-only",
        OPT_VERIFY_ONLY && "--verify-only",
        OPT_REQUIRE_PASSWORD && "--require-password",
        TARGET_ENV_FILE && `--target-env=${TARGET_ENV_FILE}`,
        ONLY_TABLES && `--tables=${ONLY_TABLES.join(",")}`,
        `batch-size=${BATCH_SIZE}`,
    ].filter(Boolean).join(" ") || "(none)");

    if (PASSWORD_RESULT.source === "defaulted") {
        console.warn("Target password: using DEFAULT_PASSWORD fallback — set TIDB_PASSWORD to override.");
    } else if (PASSWORD_RESULT.source === "empty") {
        console.warn("Target password: empty — set TIDB_PASSWORD or DEFAULT_PASSWORD if TiDB requires one.");
    }
    console.log("");
}

// Map a connection/handshake failure to a hint naming the env vars involved.
// The password value is never printed.
function exitWithConnectionError(err, side) {
    const code = err && err.code;
    const message = (err && err.message) || "";
    const envLabel = side === "Source" ? "DB_*" : "TIDB_* / DEFAULT_PASSWORD";

    if (code === "ER_ACCESS_DENIED_ERROR") {
        console.error(`${side} access denied — check ${envLabel} env vars in the env file.`);
    } else if (side === "Target" && /ssl|tls|certificate/i.test(message)) {
        console.error("Target TLS/handshake failed — check TIDB_SSL (1 for TiDB Cloud, 0 for local clusters).");
    } else if (code === "ECONNREFUSED" || code === "ETIMEDOUT" || code === "ENOTFOUND" || code === "EAI_AGAIN") {
        console.error(`${side} unreachable — check host/port env vars and network access.`);
    } else if (code === "ER_BAD_DB_ERROR") {
        console.error(`${side} database not found — check the database env var (or use --create-db).`);
    } else {
        console.error(`${side} connection failed:`, message);
    }
    process.exit(1);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function tableExists(connection, database, table) {
    const [rows] = await connection.query(
        `SELECT COUNT(*) AS cnt FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
        [database, table]
    );
    return Number(rows[0].cnt) > 0;
}

async function listSourceTables(source, database) {
    const [rows] = await source.query(
        `SELECT TABLE_NAME AS name, TABLE_TYPE AS type
         FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = ?
         ORDER BY TABLE_NAME`,
        [database]
    );

    const tables = rows.filter((row) => row.type === "BASE TABLE").map((row) => row.name);
    const views = rows.filter((row) => row.type !== "BASE TABLE").map((row) => row.name);
    return { tables, views };
}

async function primaryColumns(connection, database, table) {
    const [rows] = await connection.query(
        `SELECT COLUMN_NAME AS name
         FROM information_schema.KEY_COLUMN_USAGE
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND CONSTRAINT_NAME = 'PRIMARY'
         ORDER BY ORDINAL_POSITION`,
        [database, table]
    );
    return rows.map((row) => row.name);
}

async function sourceCount(connection, table) {
    const [rows] = await connection.query(`SELECT COUNT(*) AS cnt FROM \`${table}\``);
    return Number(rows[0].cnt);
}

async function targetCount(connection, database, table) {
    const exists = await tableExists(connection, database, table);
    if (!exists) return null;
    const [rows] = await connection.query(`SELECT COUNT(*) AS cnt FROM \`${table}\``);
    return Number(rows[0].cnt);
}

// ---------------------------------------------------------------------------
// Migration steps
// ---------------------------------------------------------------------------
async function ensureTargetDatabase(target) {
    if (!OPT_CREATE_DB) return;

    await target.query(
        `CREATE DATABASE IF NOT EXISTS \`${TGT.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci`
    );
    console.log(`Ensured target database \`${TGT.database}\` exists.`);
}

async function migrateSchema(source, target, tables, summary) {
    // Table order does not matter while FK checks are off.
    await target.query("SET FOREIGN_KEY_CHECKS = 0");
    const skipped = new Set();

    for (const table of tables) {
        try {
            const exists = await tableExists(target, TGT.database, table);
            if (exists && !OPT_DROP) {
                // Leave existing tables untouched so re-runs never duplicate data.
                skipped.add(table);
                summary.push({ table, schema: "skipped (exists)", rows: "skipped" });
                continue;
            }
            if (exists && OPT_DROP) {
                await target.query(`DROP TABLE IF EXISTS \`${table}\``);
            }

            const [createRows] = await source.query(`SHOW CREATE TABLE \`${table}\``);
            let createSql = createRows[0]["Create Table"];
            if (!createSql) {
                throw new Error("SHOW CREATE TABLE returned no statement");
            }

            try {
                await target.query(createSql);
            } catch (err) {
                // MySQL 8 defaults to utf8mb4_0900_ai_ci, which older TiDB
                // versions reject — retry once with a compatible collation.
                if (
                    err.code === "ER_UNKNOWN_COLLATION" &&
                    createSql.includes("utf8mb4_0900_ai_ci")
                ) {
                    createSql = createSql.replaceAll("utf8mb4_0900_ai_ci", "utf8mb4_general_ci");
                    await target.query(createSql);
                } else {
                    throw err;
                }
            }

            summary.push({ table, schema: "created", rows: "—" });
        } catch (err) {
            summary.push({ table, schema: `FAILED: ${err.code || err.message}`, rows: "—" });
        }
    }

    await target.query("SET FOREIGN_KEY_CHECKS = 1");
    return skipped;
}

async function migrateTableData(source, target, table, summary) {
    // Column list comes from information_schema so the SELECT column order and
    // the INSERT column list always match.
    const [colRows] = await source.query(
        `SELECT COLUMN_NAME AS name
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
         ORDER BY ORDINAL_POSITION`,
        [SRC.database, table]
    );
    const columns = colRows.map((row) => row.name);
    if (columns.length === 0) {
        summary.push({ table, schema: "(see above)", rows: "FAILED: no columns found" });
        return;
    }

    const colList = columns.map((c) => `\`${c}\``).join(", ");
    const insertSql = `INSERT INTO \`${table}\` (${colList}) VALUES ?`;

    const pk = await primaryColumns(source, SRC.database, table);
    const orderBy = pk.length > 0 ? ` ORDER BY ${pk.map((c) => `\`${c}\``).join(", ")}` : "";

    let inserted = 0;
    let buffer = [];

    const flush = async () => {
        if (buffer.length === 0) return;
        const batch = buffer;
        buffer = [];
        await target.query(insertSql, [batch]);
        inserted += batch.length;
    };

    try {
        // Streaming requires the raw (non-promise) mysql2 connection, exposed
        // as `.connection` on the promise wrapper.
        const rowStream = source
            .connection
            .query(`SELECT ${colList} FROM \`${table}\`${orderBy}`)
            .stream();

        for await (const row of rowStream) {
            buffer.push(columns.map((c) => row[c]));
            if (buffer.length >= BATCH_SIZE) {
                await flush();
            }
        }
        await flush();

        summary.push({ table, schema: "(see above)", rows: `copied ${inserted.toLocaleString()}` });
    } catch (err) {
        summary.push({
            table,
            schema: "(see above)",
            rows: `FAILED after ${inserted.toLocaleString()}: ${err.code || err.message}`,
        });
    }
}

async function syncAutoIncrement(source, target, tables, skipped) {
    const [rows] = await source.query(
        `SELECT TABLE_NAME AS name, AUTO_INCREMENT AS ai
         FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = ? AND AUTO_INCREMENT IS NOT NULL`,
        [SRC.database]
    );

    let synced = 0;
    for (const row of rows) {
        if (!tables.includes(row.name) || skipped.has(row.name)) continue;
        try {
            await target.query(`ALTER TABLE \`${row.name}\` AUTO_INCREMENT = ${Number(row.ai)}`);
            synced += 1;
        } catch (err) {
            console.warn(`  Could not set AUTO_INCREMENT for ${row.name}: ${err.code || err.message}`);
        }
    }
    console.log(`AUTO_INCREMENT synced on ${synced} table(s).`);
}

async function verify(source, target, tables, summary) {
    console.log("\n== Verification (row counts) ==");
    let mismatches = 0;

    for (const table of tables) {
        const src = await sourceCount(source, table);
        const tgt = await targetCount(target, TGT.database, table);
        const ok = src === tgt;
        if (!ok) mismatches += 1;
        summary.push({
            table,
            schema: OPT_VERIFY_ONLY ? "—" : "(see above)",
            rows: ok ? `✓ ${src.toLocaleString()}` : `✗ source ${src.toLocaleString()} vs target ${tgt === null ? "missing" : tgt.toLocaleString()}`,
        });
    }

    return mismatches;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
    validateConfig();
    logConfig();

    let source;
    let target;

    try {
        source = await mysql.createConnection(SRC);
    } catch (err) {
        exitWithConnectionError(err, "Source");
    }
    try {
        target = await mysql.createConnection({ ...TGT, database: undefined });
    } catch (err) {
        exitWithConnectionError(err, "Target");
    }

    try {
        // Pre-flight: prove both connections can actually talk before any work.
        // --drop would destroy data on the target, so fail fast on misconfig.
        try {
            await source.query("SELECT 1");
        } catch (err) {
            exitWithConnectionError(err, "Source");
        }
        try {
            await target.query("SELECT 1");
        } catch (err) {
            exitWithConnectionError(err, "Target");
        }
        await source.query(`USE \`${SRC.database}\``);
        if (OPT_CREATE_DB) {
            await ensureTargetDatabase(target);
        }
        await target.query(`USE \`${TGT.database}\``);

        const { tables: allTables, views } = await listSourceTables(source, SRC.database);
        if (views.length > 0) {
            console.log(`Skipping ${views.length} view(s): ${views.join(", ")}`);
        }

        const tables = ONLY_TABLES
            ? allTables.filter((t) => ONLY_TABLES.includes(t))
            : allTables;

        const missing = ONLY_TABLES ? ONLY_TABLES.filter((t) => !allTables.includes(t)) : [];
        if (missing.length > 0) {
            console.warn(`WARNING: requested table(s) not found in source: ${missing.join(", ")}`);
        }

        console.log(`Found ${allTables.length} table(s); migrating ${tables.length}.\n`);

        const summary = [];

        if (OPT_VERIFY_ONLY) {
            const mismatches = await verify(source, target, tables, summary);

            console.log("\n================ SUMMARY ================");
            console.table(summary);
            console.log("=========================================");

            if (mismatches > 0) {
                console.error(`\nVERIFICATION FAILED: ${mismatches} table(s) have row-count mismatches.`);
                process.exitCode = 1;
            } else {
                console.log("\nVERIFICATION PASSED.");
            }
        } else {
            console.log("== Schema ==");
            const skipped = await migrateSchema(source, target, tables, summary);

            if (!OPT_SCHEMA_ONLY) {
                console.log("\n== Data ==");
                // Insert order is alphabetical, so referenced rows may not exist
                // yet — copy with FK checks off (same session), then restore.
                await target.query("SET FOREIGN_KEY_CHECKS = 0");
                for (const table of tables) {
                    process.stdout.write(`  ${table} … `);
                    if (skipped.has(table)) {
                        console.log("skipped (table already exists)");
                        continue;
                    }
                    await migrateTableData(source, target, table, summary);
                    console.log(summary[summary.length - 1].rows);
                }
                await target.query("SET FOREIGN_KEY_CHECKS = 1");

                console.log("\n== AUTO_INCREMENT ==");
                await syncAutoIncrement(source, target, tables, skipped);
            }

            const mismatches = OPT_SCHEMA_ONLY ? 0 : await verify(source, target, tables, summary);

            console.log("\n================ SUMMARY ================");
            console.table(summary);
            console.log("=========================================");

            if (mismatches > 0) {
                console.error(`\nMIGRATION INCOMPLETE: ${mismatches} table(s) have row-count mismatches.`);
                process.exitCode = 1;
            } else {
                console.log("\nMIGRATION COMPLETE.");
            }
        }
    } finally {
        await source.end();
        await target.end();
    }
}

main().catch((err) => {
    console.error("\nMIGRATION FAILED:", err.message);
    process.exitCode = 1;
});
