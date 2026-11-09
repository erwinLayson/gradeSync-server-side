-- 0042_consolidate_class_adviser.sql

-- 1. Add adviserFacultyId to classrooms
ALTER TABLE `classrooms`
ADD COLUMN IF NOT EXISTS `adviserFacultyId` BIGINT(20) DEFAULT NULL;

-- 2. Add foreign key constraint
ALTER TABLE `classrooms`
ADD CONSTRAINT `fk_classrooms_adviser`
FOREIGN KEY (`adviserFacultyId`)
REFERENCES `faculties` (`id`)
ON DELETE SET NULL
ON UPDATE CASCADE;

-- 3. Migrate existing adviser assignments
UPDATE `classrooms` c
JOIN `class_adviser` ca ON c.id = ca.classId
SET c.adviserFacultyId = ca.facultyId
WHERE ca.facultyId IS NOT NULL;

-- 4. Drop redundant table
DROP TABLE IF EXISTS `class_adviser`;