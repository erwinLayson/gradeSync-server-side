-- school_logo - the school's uploaded logo, managed in Admin Settings ->
-- School Information and shown in the authenticated sidebar.
--
-- The image bytes live IN the database instead of the server's local filesystem:
-- the deployment's disk is ephemeral (Render), so a stored file path would not
-- survive restarts/redeploys. One row per school_info record.
CREATE TABLE IF NOT EXISTS `school_logo` (
  `schoolInfoId` int(11) NOT NULL,
  `image` mediumblob NOT NULL,
  `mimeType` varchar(32) NOT NULL,
  `byteSize` int(11) NOT NULL,
  `updatedBy` int(11) DEFAULT NULL,
  `updatedAt` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`schoolInfoId`),
  CONSTRAINT `fk_school_logo_school_info` FOREIGN KEY (`schoolInfoId`) REFERENCES `school_info` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
