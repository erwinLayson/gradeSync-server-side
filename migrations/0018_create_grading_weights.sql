-- grading_weights — per class-subject grading weights.
CREATE TABLE IF NOT EXISTS `grading_weights` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `classSubjectId` bigint(20) NOT NULL,
  `writtenWorkWeight` decimal(5,2) NOT NULL DEFAULT 20.00,
  `performanceTaskWeight` decimal(5,2) NOT NULL DEFAULT 60.00,
  `quarterlyAssessmentWeight` decimal(5,2) NOT NULL DEFAULT 20.00,
  `attendanceWeight` decimal(5,2) NOT NULL DEFAULT 0.00,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_weight_class_subject` (`classSubjectId`),
  CONSTRAINT `fk_weights_class_subject` FOREIGN KEY (`classSubjectId`) REFERENCES `class_subjects` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
