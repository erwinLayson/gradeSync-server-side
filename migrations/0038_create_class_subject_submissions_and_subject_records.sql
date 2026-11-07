-- 0038_create_class_subject_submissions_and_subject_records.sql
-- Subject Teacher Record Ownership, Centralized Student Records, and Unified Amendment Workflow

-- 1. Create class_subject_submissions table to track quarterly submissions per subject
CREATE TABLE IF NOT EXISTS `class_subject_submissions` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `classSubjectId` bigint(20) NOT NULL,
  `quarter` tinyint(4) NOT NULL,
  `schoolYearId` int(11) NOT NULL,
  `status` enum('pending','submitted') NOT NULL DEFAULT 'pending',
  `submittedAt` datetime DEFAULT NULL,
  `submittedBy` bigint(20) DEFAULT NULL,
  `totalStudents` int(11) NOT NULL DEFAULT 0,
  `submittedStudents` int(11) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_class_subject_quarter_sy` (`classSubjectId`, `quarter`, `schoolYearId`),
  KEY `fk_css_submittedBy` (`submittedBy`),
  KEY `fk_css_schoolYear` (`schoolYearId`),
  KEY `idx_css_status_quarter` (`status`, `quarter`),
  CONSTRAINT `fk_css_class_subject` FOREIGN KEY (`classSubjectId`) 
    REFERENCES `class_subjects` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_css_faculty` FOREIGN KEY (`submittedBy`) 
    REFERENCES `faculties` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_css_schoolYear` FOREIGN KEY (`schoolYearId`) 
    REFERENCES `schoolyear` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 2. Widen recordType in amendment tables to include 'subject_record'
ALTER TABLE `amendment_requests` 
MODIFY COLUMN `recordType` enum('gradebook_score','student_record_grade','attendance','subject_record') NOT NULL;

ALTER TABLE `amendment_permissions` 
MODIFY COLUMN `recordType` enum('gradebook_score','student_record_grade','attendance','subject_record') NOT NULL;

ALTER TABLE `amendment_audit_logs` 
MODIFY COLUMN `recordType` enum('gradebook_score','student_record_grade','attendance','subject_record') NOT NULL;

