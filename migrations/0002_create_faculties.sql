-- faculties — teaching and register staff; `role` distinguishes the two kinds.
CREATE TABLE IF NOT EXISTS `faculties` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `email` varchar(255) NOT NULL,
  `firstname` varchar(50) NOT NULL,
  `middlename` varchar(20) NOT NULL,
  `lastname` varchar(50) NOT NULL,
  `suffix` varchar(10) DEFAULT NULL,
  `userId` bigint(20) NOT NULL,
  `role` enum('teacher','register') NOT NULL DEFAULT 'teacher',
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`),
  KEY `fk_faculty1` (`userId`),
  CONSTRAINT `fk_faculty1` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `chk_faculties_role` CHECK (`role` in ('teacher','register'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
