-- class_students — link between a classroom and its enrollments.
CREATE TABLE IF NOT EXISTS `class_students` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `classId` int(11) NOT NULL,
  `enrollmentId` bigint(20) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_class_student1` (`classId`),
  KEY `fk_class_student2` (`enrollmentId`),
  CONSTRAINT `fk_class_student1` FOREIGN KEY (`classId`) REFERENCES `classrooms` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_class_student2` FOREIGN KEY (`enrollmentId`) REFERENCES `enrollments` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
