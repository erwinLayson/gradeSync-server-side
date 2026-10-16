-- landing_content — editable per-section landing-page content.
CREATE TABLE IF NOT EXISTS `landing_content` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `section` varchar(64) NOT NULL,
  `content` json NOT NULL,
  `updatedBy` bigint(20) DEFAULT NULL,
  `updatedAt` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `landing_content_section_unique` (`section`),
  KEY `fk_landing_content_updated_by` (`updatedBy`),
  CONSTRAINT `fk_landing_content_updated_by` FOREIGN KEY (`updatedBy`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
