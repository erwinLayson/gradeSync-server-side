-- classrooms — sections/grade levels (soft-archived via `status`).
CREATE TABLE IF NOT EXISTS `classrooms` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `section` varchar(20) NOT NULL,
  `gradeLevel` tinyint(4) NOT NULL,
  `status` enum('active','inactive') NOT NULL DEFAULT 'active',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_classroom_section` (`section`,`gradeLevel`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
