-- assessments — graded activities for a class-subject.
CREATE TABLE IF NOT EXISTS `assessments` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `classSubjectId` bigint(20) NOT NULL,
  `quarter` tinyint(4) NOT NULL,
  `type` enum('written_work','performance_task','quarterly_assessment') NOT NULL,
  `title` varchar(255) NOT NULL,
  `maxScore` decimal(6,2) NOT NULL,
  `dateGiven` date DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `componentId` bigint(20) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_assessments_classSubject` (`classSubjectId`),
  KEY `fk_assessments_component` (`componentId`),
  CONSTRAINT `fk_assessments_classSubject` FOREIGN KEY (`classSubjectId`) REFERENCES `class_subjects` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_assessments_component` FOREIGN KEY (`componentId`) REFERENCES `subject_components` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
