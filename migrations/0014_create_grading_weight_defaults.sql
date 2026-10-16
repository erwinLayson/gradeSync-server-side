-- grading_weight_defaults — single-row school-wide default grading weights.
CREATE TABLE IF NOT EXISTS `grading_weight_defaults` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `writtenWorkWeight` decimal(5,2) NOT NULL DEFAULT 20.00,
  `performanceTaskWeight` decimal(5,2) NOT NULL DEFAULT 60.00,
  `quarterlyAssessmentWeight` decimal(5,2) NOT NULL DEFAULT 20.00,
  `attendanceWeight` decimal(5,2) NOT NULL DEFAULT 0.00,
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
