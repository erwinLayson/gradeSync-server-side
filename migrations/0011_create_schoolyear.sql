-- schoolyear — one active year at a time; `status` marks completed years.
CREATE TABLE IF NOT EXISTS `schoolyear` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `startYear` varchar(20) NOT NULL,
  `endYear` varchar(20) NOT NULL,
  `isActive` tinyint(1) NOT NULL DEFAULT 0,
  `status` enum('ongoing','completed') NOT NULL DEFAULT 'ongoing',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
