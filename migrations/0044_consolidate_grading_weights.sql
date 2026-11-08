-- 0044_consolidate_grading_weights.sql
-- Consolidate grading_weight_defaults into grading_weights with nullable classSubjectId

-- 1. Allow classSubjectId to be NULL for system-wide default weights
ALTER TABLE `grading_weights` 
MODIFY COLUMN `classSubjectId` bigint(20) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp();

-- 2. Migrate existing default weights into grading_weights as the default row (classSubjectId IS NULL)
INSERT INTO `grading_weights` (`classSubjectId`, `writtenWorkWeight`, `performanceTaskWeight`, `quarterlyAssessmentWeight`, `attendanceWeight`)
SELECT NULL, `writtenWorkWeight`, `performanceTaskWeight`, `quarterlyAssessmentWeight`, `attendanceWeight`
FROM `grading_weight_defaults`
LIMIT 1;

-- 3. Drop the redundant grading_weight_defaults table
DROP TABLE IF EXISTS `grading_weight_defaults`;

