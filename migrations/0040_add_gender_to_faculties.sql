-- 0040_add_gender_to_faculties.sql
-- Add gender column to faculties table.
ALTER TABLE `faculties` ADD COLUMN `gender` varchar(20) DEFAULT NULL AFTER `suffix`;

