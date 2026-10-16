-- 0032_add_schoolyear_status.sql
-- Repair for databases whose `schoolyear` table predates the `status` column.
--
-- `status` was folded into 0011_create_schoolyear.sql, but a table that already
-- existed when the migration ran is left untouched by `CREATE TABLE IF NOT
-- EXISTS` — so any database provisioned from an older source (e.g. a TiDB target
-- cloned by scripts/migrate-to-tidb.mjs from a pre-`status` MySQL database) is
-- missing the column even though 0011 is recorded in schema_migrations. The app
-- then fails with `Unknown column 'status' in 'field list'`.
--
-- Idempotent: the guard runs the ALTER only when the column is absent, so a
-- fresh install (0011 already created the column) is a no-op.

SET @status_missing := (
  SELECT COUNT(*) = 0
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'schoolyear'
    AND COLUMN_NAME = 'status'
);

SET @add_status := IF(
  @status_missing,
  'ALTER TABLE `schoolyear` ADD COLUMN `status` enum(''ongoing'',''completed'') NOT NULL DEFAULT ''ongoing'' AFTER `isActive`',
  'DO 0'
);
PREPARE stmt_add_status FROM @add_status;
EXECUTE stmt_add_status;
DEALLOCATE PREPARE stmt_add_status;

-- Conservative backfill, only for the rows the ALTER just created. Years that
-- started before the active year become `completed`; the active year and any
-- later year stay `ongoing`; when no year is active nothing changes.
SET @backfill_status := IF(
  @status_missing,
  'UPDATE `schoolyear` s
     JOIN (SELECT `startYear` AS `activeStart` FROM `schoolyear` WHERE `isActive` = 1 ORDER BY `id` DESC LIMIT 1) a ON 1 = 1
     SET s.`status` = ''completed''
     WHERE s.`isActive` = 0
       AND CAST(s.`startYear` AS UNSIGNED) < CAST(a.`activeStart` AS UNSIGNED)',
  'DO 0'
);
PREPARE stmt_backfill_status FROM @backfill_status;
EXECUTE stmt_backfill_status;
DEALLOCATE PREPARE stmt_backfill_status;
