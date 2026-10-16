-- student_attendance — per-subject daily attendance.
CREATE TABLE IF NOT EXISTS `student_attendance` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `classSubjectId` bigint(20) NOT NULL,
  `enrollmentId` bigint(20) NOT NULL,
  `status` enum('present','absent') DEFAULT NULL,
  `quarter` tinyint(4) NOT NULL DEFAULT 1,
  `date` date NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_attendance_once` (`classSubjectId`,`enrollmentId`,`date`),
  KEY `fk_attendance_enrollment` (`enrollmentId`),
  KEY `fk_attendance_class_subject` (`classSubjectId`),
  KEY `idx_attendance_quarter` (`quarter`),
  CONSTRAINT `fk_attendance_class_subject` FOREIGN KEY (`classSubjectId`) REFERENCES `class_subjects` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_attendance_enrollment` FOREIGN KEY (`enrollmentId`) REFERENCES `enrollments` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
