-- academic_settings — single-row quarter / enrollment configuration.
CREATE TABLE IF NOT EXISTS `academic_settings` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `currentQuarter` tinyint(1) NOT NULL DEFAULT 1,
  `enrollmentOpen` tinyint(1) NOT NULL DEFAULT 1,
  `submissionsLocked` tinyint(1) NOT NULL DEFAULT 0,
  `numQuarters` tinyint(1) NOT NULL DEFAULT 4,
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  CONSTRAINT `chk_num_quarters` CHECK (`numQuarters` in (3,4))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
