-- Migration: Add enrollment.status + simplify students.status
-- Date: 2026-08-19
-- Purpose: Support removing students from classrooms (soft-delete enrollment)

-- 1. Convert existing 'enrolled' and 'graduated' students to 'active'
UPDATE students SET status = 'active' WHERE status IN ('enrolled', 'graduated');

-- 2. Simplify students.status enum (remove 'enrolled' and 'graduated')
ALTER TABLE students
  MODIFY COLUMN status ENUM('active','inactive') DEFAULT NULL;

-- 3. Add status column to enrollments
ALTER TABLE enrollments
  ADD COLUMN status ENUM('enrolled','unenrolled','dropped','completed') NOT NULL DEFAULT 'enrolled';

-- 4. Ensure all existing enrollments are marked as 'enrolled' (safety, already the default)
UPDATE enrollments SET status = 'enrolled' WHERE status IS NULL;
