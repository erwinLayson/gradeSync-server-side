-- student_scores — one score per student per assessment.
CREATE TABLE IF NOT EXISTS `student_scores` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `assessmentId` bigint(20) NOT NULL,
  `enrollmentId` bigint(20) NOT NULL,
  `score` decimal(6,2) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT NULL ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_score_once` (`assessmentId`,`enrollmentId`),
  KEY `fk_scores_enrollment` (`enrollmentId`),
  CONSTRAINT `fk_scores_assessment` FOREIGN KEY (`assessmentId`) REFERENCES `assessments` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_scores_enrollment` FOREIGN KEY (`enrollmentId`) REFERENCES `enrollments` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
