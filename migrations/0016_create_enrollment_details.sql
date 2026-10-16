-- enrollment_details — subjects an enrollment is taking.
CREATE TABLE IF NOT EXISTS `enrollment_details` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `enrollmentId` bigint(20) NOT NULL,
  `subjectId` int(11) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
