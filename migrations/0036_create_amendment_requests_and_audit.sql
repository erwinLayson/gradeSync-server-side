-- Grade and Attendance Amendment and Record Locking Policy
-- Migration: 0036_create_amendment_requests_and_audit.sql
-- Adheres to MySQL 8 / MariaDB syntax conventions.

-- 1. amendment_requests — tracks the formal request lifecycle from submission to resolution.
CREATE TABLE IF NOT EXISTS `amendment_requests` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `requestNumber` varchar(32) NOT NULL,
  `requesterFacultyId` bigint(20) NOT NULL,
  `enrollmentId` bigint(20) NOT NULL,
  `classSubjectId` bigint(20) DEFAULT NULL,
  `classId` int(11) NOT NULL,
  `quarter` tinyint(4) NOT NULL,
  `recordType` enum('gradebook_score','student_record_grade','attendance') NOT NULL,
  `reason` text NOT NULL,
  `details` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL CHECK (json_valid(`details`)),
  `status` enum('pending','approved','rejected','completed','expired','revoked') NOT NULL DEFAULT 'pending',
  `reviewerUserId` bigint(20) DEFAULT NULL,
  `reviewedAt` datetime DEFAULT NULL,
  `rejectionReason` text DEFAULT NULL,
  `completedAt` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_amendment_request_number` (`requestNumber`),
  KEY `fk_amd_requester` (`requesterFacultyId`),
  KEY `fk_amd_enrollment` (`enrollmentId`),
  KEY `fk_amd_class_subject` (`classSubjectId`),
  KEY `fk_amd_class` (`classId`),
  KEY `fk_amd_reviewer` (`reviewerUserId`),
  KEY `idx_amd_status_quarter` (`status`, `quarter`),
  KEY `idx_amd_student_lookup` (`enrollmentId`, `quarter`, `recordType`),
  CONSTRAINT `fk_amd_requester` FOREIGN KEY (`requesterFacultyId`) REFERENCES `faculties` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_amd_enrollment` FOREIGN KEY (`enrollmentId`) REFERENCES `enrollments` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_amd_class_subject` FOREIGN KEY (`classSubjectId`) REFERENCES `class_subjects` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_amd_class` FOREIGN KEY (`classId`) REFERENCES `classrooms` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_amd_reviewer` FOREIGN KEY (`reviewerUserId`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 2. amendment_permissions — active, temporary authorization tokens granted upon request approval.
CREATE TABLE IF NOT EXISTS `amendment_permissions` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `requestId` bigint(20) NOT NULL,
  `facultyId` bigint(20) NOT NULL,
  `enrollmentId` bigint(20) NOT NULL,
  `classSubjectId` bigint(20) DEFAULT NULL,
  `classId` int(11) NOT NULL,
  `quarter` tinyint(4) NOT NULL,
  `recordType` enum('gradebook_score','student_record_grade','attendance') NOT NULL,
  `assessmentId` bigint(20) DEFAULT NULL,
  `attendanceDate` date DEFAULT NULL,
  `status` enum('active','consumed','revoked','expired') NOT NULL DEFAULT 'active',
  `expiresAt` datetime NOT NULL,
  `consumedAt` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_perm_request` (`requestId`),
  KEY `fk_perm_faculty` (`facultyId`),
  KEY `fk_perm_enrollment` (`enrollmentId`),
  KEY `idx_perm_lookup` (`facultyId`, `enrollmentId`, `quarter`, `recordType`, `status`, `expiresAt`),
  CONSTRAINT `fk_perm_request` FOREIGN KEY (`requestId`) REFERENCES `amendment_requests` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_perm_faculty` FOREIGN KEY (`facultyId`) REFERENCES `faculties` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_perm_enrollment` FOREIGN KEY (`enrollmentId`) REFERENCES `enrollments` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 3. amendment_audit_logs — append-only, tamper-evident ledger recording all state changes and data modifications.
CREATE TABLE IF NOT EXISTS `amendment_audit_logs` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `requestId` bigint(20) DEFAULT NULL,
  `action` enum('requested','approved','rejected','modified','reopened','re_submitted','consumed','expired','revoked') NOT NULL,
  `actorUserId` bigint(20) NOT NULL,
  `actorRole` varchar(30) NOT NULL,
  `recordType` enum('gradebook_score','student_record_grade','attendance') NOT NULL,
  `enrollmentId` bigint(20) NOT NULL,
  `quarter` tinyint(4) NOT NULL,
  `targetTable` varchar(64) NOT NULL,
  `targetRecordId` varchar(64) NOT NULL,
  `beforeState` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (`beforeState` IS NULL OR json_valid(`beforeState`)),
  `afterState` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (`afterState` IS NULL OR json_valid(`afterState`)),
  `diff` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (`diff` IS NULL OR json_valid(`diff`)),
  `reason` text DEFAULT NULL,
  `ipAddress` varchar(45) DEFAULT NULL,
  `userAgent` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_audit_request` (`requestId`),
  KEY `fk_audit_actor` (`actorUserId`),
  KEY `idx_audit_enrollment` (`enrollmentId`, `quarter`),
  KEY `idx_audit_action_created` (`action`, `created_at`),
  CONSTRAINT `fk_audit_request` FOREIGN KEY (`requestId`) REFERENCES `amendment_requests` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_audit_actor` FOREIGN KEY (`actorUserId`) REFERENCES `users` (`id`) ON DELETE NO ACTION ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
