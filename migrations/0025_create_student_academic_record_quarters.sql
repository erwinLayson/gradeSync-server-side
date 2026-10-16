-- student_academic_record_quarters — per-quarter submission ledger.
CREATE TABLE IF NOT EXISTS `student_academic_record_quarters` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `recordId` bigint(20) NOT NULL,
  `quarter` tinyint(4) NOT NULL,
  `status` enum('pending','submitted') NOT NULL DEFAULT 'pending',
  `submittedAt` datetime DEFAULT NULL,
  `submittedBy` bigint(20) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_record_quarter` (`recordId`,`quarter`),
  KEY `fk_record_quarter_submittedBy` (`submittedBy`),
  CONSTRAINT `fk_record_quarter_faculty` FOREIGN KEY (`submittedBy`) REFERENCES `faculties` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_record_quarter_record` FOREIGN KEY (`recordId`) REFERENCES `student_academic_records` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
