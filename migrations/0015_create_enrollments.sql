-- enrollments — a student enrolled in a class for a school year.
CREATE TABLE IF NOT EXISTS `enrollments` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `dateEnrolled` date NOT NULL DEFAULT curdate(),
  `classId` int(11) NOT NULL,
  `schoolYearId` int(11) NOT NULL,
  `studentId` bigint(20) NOT NULL,
  `status` enum('enrolled','unenrolled','dropped','completed') NOT NULL DEFAULT 'enrolled',
  PRIMARY KEY (`id`),
  KEY `fk_enrollment_studentId` (`studentId`),
  CONSTRAINT `fk_enrollment_studentId` FOREIGN KEY (`studentId`) REFERENCES `students` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
