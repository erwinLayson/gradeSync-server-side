-- 0045_consolidate_school_logo.sql
-- Consolidate school_logo and eliminate school_logo_chunk.
--
-- The logo binary bytes are stored directly in school_logo.image (MEDIUMBLOB),
-- matching the clean architecture of school_signature. The upload limit is
-- standardized at 1 MB, ensuring all statements fit within database packet limits
-- without multi-query chunking.

DROP TABLE IF EXISTS `school_logo_chunk`;

