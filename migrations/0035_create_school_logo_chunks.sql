-- Store the school logo in fixed-size chunks instead of one large BLOB row.
--
-- MySQL's max_allowed_packet defaults to 1 MB in some installations, so a
-- single INSERT carrying a 5 MB logo fails with ER_NET_PACKET_TOO_LARGE even
-- though MEDIUMBLOB can hold it. Writing 256 KB chunks keeps every statement
-- below that limit. school_logo.image remains for logos saved before this
-- migration; new saves store the bytes in school_logo_chunk and leave image
-- empty.
CREATE TABLE IF NOT EXISTS `school_logo_chunk` (
  `schoolInfoId` int(11) NOT NULL,
  `chunkIndex` int(11) NOT NULL,
  `data` mediumblob NOT NULL,
  PRIMARY KEY (`schoolInfoId`, `chunkIndex`),
  CONSTRAINT `fk_school_logo_chunk_logo` FOREIGN KEY (`schoolInfoId`) REFERENCES `school_logo` (`schoolInfoId`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
