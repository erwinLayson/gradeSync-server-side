-- student_academic_record_subjects — per-subject quarter grades (name/code snapshots).
CREATE TABLE IF NOT EXISTS `student_academic_record_subjects` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `recordId` bigint(20) NOT NULL,
  `subjectName` varchar(50) NOT NULL,
  `subjectCode` varchar(50) NOT NULL,
  `q1` decimal(5,2) DEFAULT NULL,
  `q2` decimal(5,2) DEFAULT NULL,
  `q3` decimal(5,2) DEFAULT NULL,
  `q4` decimal(5,2) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_record_subject_name` (`recordId`,`subjectName`),
  CONSTRAINT `fk_recordId` FOREIGN KEY (`recordId`) REFERENCES `student_academic_records` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
