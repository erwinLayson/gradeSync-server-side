-- school_signature — the school's authorized handwritten signature, captured in
-- Admin Settings → School Information and later reused on official documents
-- (e.g. SF10). One row per school_info record.
--
-- The image bytes live IN the database instead of the server's local filesystem:
-- the deployment's disk is ephemeral (Render), so a stored file path would not
-- survive restarts/redeploys. `mediumblob` holds a canvas PNG (capped at 1 MB by
-- the API) without the ~33% bloat of a base64 text column.
CREATE TABLE IF NOT EXISTS `school_signature` (
  `schoolInfoId` int(11) NOT NULL,
  `image` mediumblob NOT NULL,
  `mimeType` varchar(32) NOT NULL,
  `byteSize` int(11) NOT NULL,
  `updatedBy` int(11) DEFAULT NULL,
  `updatedAt` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`schoolInfoId`),
  CONSTRAINT `fk_school_signature_school_info` FOREIGN KEY (`schoolInfoId`) REFERENCES `school_info` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
