# Ops scripts

One-off/operational utilities. These are **not** part of the running app and are
not compiled by `tsc` (they run via `node`).

## `migrate-to-tidb.mjs`

Copies the full schema **and** data from the MySQL source in your `.env`
(`DB_*`) into a TiDB target (`TIDB_*`), with no manual dump/import. TiDB speaks
the MySQL protocol, so `mysql2` is used on both ends.

> This is **not** the app's schema-migration system. That is
> `npm run migrate` (`src/migrate.ts` + `src/migrations/runner.ts`), which owns
> `schema_migrations`. Use this script only to clone/copy data between
> databases — for example seeding a fresh TiDB cluster, resetting a demo
> environment, or cloning prod into staging.

### When to use it

- First cutover from MySQL to TiDB.
- Re-seeding / cloning a TiDB cluster (fresh demo, DR, staging copy).
- Loading a local `tiup playground` with production-shaped data.

### Configuration

Source (`DB_*`) and target (`TIDB_*`) both come from the `.env` in the server
directory. Target password resolution: explicit `TIDB_PASSWORD` → `DEFAULT_PASSWORD`
→ empty; pass `--require-password` to refuse the fallbacks. `--target-env=<path>`
(or `TIDB_ENV_FILE`) loads the target from another env file's `DB_*` variables
(mapped to `TIDB_*`) — handy for a production env file without copying secrets
into the dev `.env`.

### Usage

```bash
# Preview exactly what would happen (no writes):
npm run migrate:tidb -- --dry-run

# Copy everything into TiDB (creates missing tables, skips existing ones):
npm run migrate:tidb -- --target-env=gradeSync-server-side.env

# Verify row counts only (no writes):
npm run migrate:tidb -- --verify-only --target-env=gradeSync-server-side.env

# Full reload of a subset of tables:
npm run migrate:tidb -- --drop --tables=students,enrollments
```

### Flags

| Flag | Effect |
| --- | --- |
| `--drop` | `DROP TABLE IF EXISTS` on the target before copying (fresh load) |
| `--create-db` | `CREATE DATABASE IF NOT EXISTS` on the target first |
| `--schema-only` | Create tables, skip data |
| `--verify-only` | Compare row counts and exit (no writes) |
| `--dry-run` | Plan only: list tables/rows/actions and exit (no writes) |
| `--tables=a,b` | Process only these tables |
| `--batch-size=N` | Rows per `INSERT` batch (default 500) |
| `--force` | Allow running when source and target look identical |
| `--require-password` | Abort when `TIDB_PASSWORD` is not explicitly set |
| `--target-env=PATH` | Load target creds (`DB_*` → `TIDB_*`) from another env file |
| `--with-ledger` | Copy `schema_migrations` too (exact clone). Omitted by default. |

### Safety

- Refuses to run when source and target resolve to the same host/port/database
  unless `--force` is passed (prevents `--drop` from destroying the source).
- Re-runs are idempotent: existing target tables are skipped unless `--drop`.
- `FOREIGN_KEY_CHECKS` is disabled only for the duration of the copy and
  restored in a `finally`, so a failure cannot leak that state.

### Caveats

- Views are intentionally **not** recreated (only base tables are copied).
- `schema_migrations` is **not** copied by default (`--with-ledger` restores the
  old behaviour). Copying it lets a target cloned from an out-of-date source
  claim migrations are applied while its tables keep the source's older shape
  (e.g. a `schoolyear` without `status`), which `CREATE TABLE IF NOT EXISTS`
  cannot repair. After a clone, run `npm run migrate` on the target so it
  rebuilds the ledger and applies repair migrations (e.g. `0032`).
- Existing target tables are skipped unless `--drop`, so re-running never updates
  their schema by itself — again, run `npm run migrate` on the target afterward.
- Only the `utf8mb4_0900_ai_ci` → `utf8mb4_general_ci` collation case is
  auto-corrected for older TiDB versions.
