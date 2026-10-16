-- student_academic_records — frozen class record header per enrollment.
CREATE TABLE IF NOT EXISTS `student_academic_records` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `enrollmentId` bigint(20) NOT NULL,
  `classSection` varchar(50) NOT NULL,
  `classGradeLevel` int(10) NOT NULL,
  `adviserName` varchar(50) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_enrollmentid` (`enrollmentId`),
  CONSTRAINT `fk_enrollmentid` FOREIGN KEY (`enrollmentId`) REFERENCES `enrollments` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
