-- student_academic_record_components — frozen composite-subject component grades.
CREATE TABLE IF NOT EXISTS `student_academic_record_components` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `subjectRowId` bigint(20) NOT NULL,
  `componentId` bigint(20) NOT NULL,
  `componentName` varchar(50) NOT NULL,
  `componentCode` varchar(20) NOT NULL,
  `q1` decimal(10,2) DEFAULT NULL,
  `q2` decimal(10,2) DEFAULT NULL,
  `q3` decimal(10,2) DEFAULT NULL,
  `q4` decimal(10,2) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_record_component` (`subjectRowId`,`componentId`),
  KEY `fk_component_componentId` (`componentId`),
  CONSTRAINT `fk_component_componentId` FOREIGN KEY (`componentId`) REFERENCES `subject_components` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_component_subjectRow` FOREIGN KEY (`subjectRowId`) REFERENCES `student_academic_record_subjects` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
