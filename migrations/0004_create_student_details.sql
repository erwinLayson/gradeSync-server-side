-- student_details — 1:1 additional student information.
CREATE TABLE IF NOT EXISTS `student_details` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `studentId` bigint(20) NOT NULL,
  `birthplace` varchar(255) DEFAULT NULL,
  `permanentAddress` varchar(255) DEFAULT NULL,
  `religion` varchar(100) DEFAULT NULL,
  `contactNumber` varchar(30) DEFAULT NULL,
  `guardianName` varchar(255) DEFAULT NULL,
  `guardianRelation` varchar(50) DEFAULT NULL,
  `guardianContact` varchar(30) DEFAULT NULL,
  `guardianOccupation` varchar(100) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT NULL ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_student_details_student` (`studentId`),
  CONSTRAINT `fk_student_details_student` FOREIGN KEY (`studentId`) REFERENCES `students` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
