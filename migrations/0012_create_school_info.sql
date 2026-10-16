-- school_info — single-row school identity/details.
CREATE TABLE IF NOT EXISTS `school_info` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `schoolId` int(11) NOT NULL,
  `name` varchar(255) NOT NULL,
  `district` varchar(255) NOT NULL,
  `division` varchar(255) NOT NULL,
  `region` varchar(255) NOT NULL,
  `principal` varchar(255) NOT NULL,
  `address` varchar(255) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
