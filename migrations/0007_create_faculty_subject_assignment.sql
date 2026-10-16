-- faculty_subject_assignment — subjects a faculty member is qualified to teach.
CREATE TABLE IF NOT EXISTS `faculty_subject_assignment` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `facultyId` bigint(20) NOT NULL,
  `subjectId` int(11) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_tsa_1` (`facultyId`),
  KEY `fk_tsa_2` (`subjectId`),
  CONSTRAINT `fk_tsa_1` FOREIGN KEY (`facultyId`) REFERENCES `faculties` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_tsa_2` FOREIGN KEY (`subjectId`) REFERENCES `subjects` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
