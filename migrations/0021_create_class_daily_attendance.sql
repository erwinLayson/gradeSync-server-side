-- class_daily_attendance — adviser's class-level daily attendance.
CREATE TABLE IF NOT EXISTS `class_daily_attendance` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `classId` int(11) NOT NULL,
  `enrollmentId` bigint(20) NOT NULL,
  `date` date NOT NULL,
  `status` enum('present','absent') DEFAULT NULL,
  `quarter` tinyint(4) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_class_attendance_once` (`classId`,`enrollmentId`,`date`),
  KEY `fk_class_attendance_enrollment` (`enrollmentId`),
  KEY `fk_class_attendance_class` (`classId`),
  KEY `idx_class_attendance_quarter` (`quarter`),
  CONSTRAINT `fk_class_attendance_class` FOREIGN KEY (`classId`) REFERENCES `classrooms` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_class_attendance_enrollment` FOREIGN KEY (`enrollmentId`) REFERENCES `enrollments` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
