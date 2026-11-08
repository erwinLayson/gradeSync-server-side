-- 0041_consolidate_class_students.sql
-- Consolidate class_students into enrollments (use enrollments.classId directly)

-- 1. Ensure all enrollments have their classId preserved from class_students
UPDATE `enrollments` e
JOIN `class_students` cs ON e.id = cs.enrollmentId
SET e.classId = cs.classId
WHERE e.classId IS NULL OR e.classId = 0;

-- 2. Drop the redundant class_students table
DROP TABLE IF EXISTS `class_students`;

