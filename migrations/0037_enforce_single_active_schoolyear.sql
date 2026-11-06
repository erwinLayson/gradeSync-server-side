-- 0037_enforce_single_active_schoolyear.sql
-- Purpose: Enforce the invariant that at most one school year can be active at a time,
-- clean up invalid active states, and auto-activate when only one school year exists.

-- Step 1: In case legacy or test operations left multiple rows with isActive = 1,
-- keep only the single newest ongoing active school year and deactivate the rest.
UPDATE `schoolyear`
SET `isActive` = 0
WHERE `isActive` = 1
  AND `id` NOT IN (
    SELECT `targetId` FROM (
      SELECT `id` AS `targetId`
      FROM `schoolyear`
      WHERE `isActive` = 1
      ORDER BY (`status` = 'ongoing') DESC, `id` DESC
      LIMIT 1
    ) AS `keep`
  );

-- Step 2: Auto-activate single school year if exactly one exists but is inactive.
-- If the system only has 1 school year and it is ongoing, it should be active.
UPDATE `schoolyear`
SET `isActive` = 1
WHERE (SELECT COUNT(*) FROM (SELECT `id` FROM `schoolyear`) AS `t`) = 1
  AND `status` = 'ongoing';

-- Step 3: Add virtual generated column `active_marker` if it does not already exist.
-- Evaluates to 1 when isActive = 1, and NULL when isActive = 0.
SET @col_missing := (
  SELECT COUNT(*) = 0
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'schoolyear'
    AND COLUMN_NAME = 'active_marker'
);

SET @add_col := IF(
  @col_missing,
  'ALTER TABLE `schoolyear` ADD COLUMN `active_marker` TINYINT GENERATED ALWAYS AS (IF(`isActive` = 1, 1, NULL)) VIRTUAL',
  'DO 0'
);
PREPARE stmt_add_col FROM @add_col;
EXECUTE stmt_add_col;
DEALLOCATE PREPARE stmt_add_col;

-- Step 4: Add unique index on `active_marker` if it does not already exist.
-- In MySQL, unique constraints permit multiple NULLs but enforce uniqueness on non-NULL values (1).
-- This guarantees at the database level that exactly <= 1 row can have isActive = 1.
SET @idx_missing := (
  SELECT COUNT(*) = 0
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'schoolyear'
    AND INDEX_NAME = 'uq_single_active_schoolyear'
);

SET @add_idx := IF(
  @idx_missing,
  'ALTER TABLE `schoolyear` ADD UNIQUE KEY `uq_single_active_schoolyear` (`active_marker`)',
  'DO 0'
);
PREPARE stmt_add_idx FROM @add_idx;
EXECUTE stmt_add_idx;
DEALLOCATE PREPARE stmt_add_idx;

