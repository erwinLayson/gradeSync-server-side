-- class_subjects — a subject taught by a faculty member in a classroom.
CREATE TABLE IF NOT EXISTS `class_subjects` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `classId` int(11) NOT NULL,
  `facultyId` bigint(20) NOT NULL,
  `subjectId` int(11) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_class_subjects` (`classId`,`facultyId`,`subjectId`),
  KEY `FK_facultyId` (`facultyId`),
  KEY `fk_subjectId` (`subjectId`),
  CONSTRAINT `FK_facultyId` FOREIGN KEY (`facultyId`) REFERENCES `faculties` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_classId` FOREIGN KEY (`classId`) REFERENCES `classrooms` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_subjectId` FOREIGN KEY (`subjectId`) REFERENCES `subjects` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
