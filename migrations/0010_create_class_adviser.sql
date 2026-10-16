-- class_adviser — the faculty member advising a classroom.
CREATE TABLE IF NOT EXISTS `class_adviser` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `classId` int(11) NOT NULL,
  `facultyId` bigint(20) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `classId` (`classId`),
  KEY `facultyId` (`facultyId`),
  CONSTRAINT `class_adviser_ibfk_1` FOREIGN KEY (`classId`) REFERENCES `classrooms` (`id`),
  CONSTRAINT `class_adviser_ibfk_2` FOREIGN KEY (`facultyId`) REFERENCES `faculties` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `fk_class_adviser2` FOREIGN KEY (`classId`) REFERENCES `classrooms` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_facultyId_1` FOREIGN KEY (`facultyId`) REFERENCES `faculties` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
