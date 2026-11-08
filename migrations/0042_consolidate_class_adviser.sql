-- 0042_consolidate_class_adviser.sql
-- Consolidate class_adviser join table into classrooms.adviserFacultyId

-- 1. Add adviserFacultyId column to classrooms if it does not already exist
ALTER TABLE `classrooms`
ADD COLUMN IF NOT EXISTS `adviserFacultyId` bigint(20) DEFAULT NULL,
ADD CONSTRAINT `fk_classrooms_adviser` FOREIGN KEY (`adviserFacultyId`) 
  REFERENCES `faculties` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- 2. Migrate existing adviser assignments from class_adviser to classrooms
UPDATE `classrooms` c
JOIN `class_adviser` ca ON c.id = ca.classId
SET c.adviserFacultyId = ca.facultyId
WHERE ca.facultyId IS NOT NULL;

-- 3. Drop the redundant class_adviser table
DROP TABLE IF EXISTS `class_adviser`;

