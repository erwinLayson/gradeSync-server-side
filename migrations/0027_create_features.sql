-- features — developer-managed feature toggles (incl. per-role login switches).
CREATE TABLE IF NOT EXISTS `features` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `key` varchar(64) NOT NULL,
  `label` varchar(128) NOT NULL,
  `description` text DEFAULT NULL,
  `enabled` tinyint(1) NOT NULL DEFAULT 1,
  `updatedBy` bigint(20) DEFAULT NULL,
  `updatedAt` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `features_key_unique` (`key`),
  KEY `fk_features_updated_by` (`updatedBy`),
  CONSTRAINT `fk_features_updated_by` FOREIGN KEY (`updatedBy`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
