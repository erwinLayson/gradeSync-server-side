-- subject_components — weighted sub-parts of a composite subject (e.g. MAPEH).
CREATE TABLE IF NOT EXISTS `subject_components` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `parentSubjectId` int(11) NOT NULL,
  `name` varchar(50) NOT NULL,
  `code` varchar(20) NOT NULL,
  `weight` decimal(5,2) NOT NULL DEFAULT 25.00,
  `createdAt` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_component_code` (`parentSubjectId`,`code`),
  CONSTRAINT `fk_component_parent` FOREIGN KEY (`parentSubjectId`) REFERENCES `subjects` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
