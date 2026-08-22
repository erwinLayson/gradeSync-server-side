-- Migration: Add subject sub-components support (MAPEH)
-- Date: 2026-08-22
-- Purpose: Support composite subjects like MAPEH with sub-components (Music, Arts, PE, Health)
-- Each component has its own assessments, scores, and grades.
-- The final subject grade is computed from component grades.

-- ============================================================
-- 1. Create subject_components table
-- Stores sub-components for composite subjects (e.g., MAPEH)
-- ============================================================
CREATE TABLE IF NOT EXISTS `subject_components` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `parentSubjectId` int(11) NOT NULL,          -- FK to subjects.id
  `name` varchar(50) NOT NULL,                 -- "Music", "Arts", "PE", "Health"
  `code` varchar(20) NOT NULL,                 -- "MAPEH-M", "MAPEH-A", etc.
  `weight` decimal(5,2) NOT NULL DEFAULT 25.00, -- Component weight in parent (must sum to 100)
  `createdAt` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_component_code` (`parentSubjectId`, `code`),
  CONSTRAINT `fk_component_parent` FOREIGN KEY (`parentSubjectId`)
    REFERENCES `subjects` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ============================================================
-- 2. Alter subjects table - add hasComponents flag
-- ============================================================
ALTER TABLE `subjects`
ADD COLUMN `hasComponents` BOOLEAN NOT NULL DEFAULT FALSE;

-- ============================================================
-- 3. Alter assessments table - add optional componentId
-- ============================================================
ALTER TABLE `assessments`
ADD COLUMN `componentId` bigint(20) DEFAULT NULL,
ADD KEY `fk_assessments_component` (`componentId`),
ADD CONSTRAINT `fk_assessments_component` FOREIGN KEY (`componentId`)
  REFERENCES `subject_components` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- 4. Create student_academic_record_components table
-- Frozen per-component grades within a subject record
-- ============================================================
CREATE TABLE IF NOT EXISTS `student_academic_record_components` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `subjectRowId` bigint(20) NOT NULL,          -- FK to student_academic_record_subjects.id
  `componentId` bigint(20) NOT NULL,           -- FK to subject_components.id
  `componentName` varchar(50) NOT NULL,        -- Snapshot at freeze time
  `componentCode` varchar(20) NOT NULL,        -- Snapshot at freeze time
  `q1` decimal(10,2) DEFAULT NULL,
  `q2` decimal(10,2) DEFAULT NULL,
  `q3` decimal(10,2) DEFAULT NULL,
  `q4` decimal(10,2) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_record_component` (`subjectRowId`, `componentId`),
  CONSTRAINT `fk_component_subjectRow` FOREIGN KEY (`subjectRowId`)
    REFERENCES `student_academic_record_subjects` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_component_componentId` FOREIGN KEY (`componentId`)
    REFERENCES `subject_components` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ============================================================
-- 5. Seed MAPEH components
-- MAPEH (id=59) is the only composite subject in DepEd JHS
-- ============================================================
-- First, mark MAPEH as having components
UPDATE `subjects` SET `hasComponents` = TRUE WHERE `code` = 'MAPEH101';

-- Then insert the components
INSERT INTO `subject_components` (`parentSubjectId`, `name`, `code`, `weight`) VALUES
((SELECT id FROM subjects WHERE code = 'MAPEH101'), 'Music', 'MAPEH-M', 25.00),
((SELECT id FROM subjects WHERE code = 'MAPEH101'), 'Arts', 'MAPEH-A', 25.00),
((SELECT id FROM subjects WHERE code = 'MAPEH101'), 'Physical Education', 'MAPEH-PE', 25.00),
((SELECT id FROM subjects WHERE code = 'MAPEH101'), 'Health', 'MAPEH-H', 25.00);
