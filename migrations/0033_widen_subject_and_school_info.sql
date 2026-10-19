-- 0033_widen_subject_and_school_info.sql
-- Widen subjects.name from varchar(20) to varchar(100) to support long subject
-- titles (e.g. 'Technology and Livelihood Education'). Also widen
-- student_academic_record_subjects.subjectName and ensure school_info
-- principal/address have default values.

ALTER TABLE `subjects` MODIFY COLUMN `name` varchar(100) NOT NULL;
ALTER TABLE `student_academic_record_subjects` MODIFY COLUMN `subjectName` varchar(100) NOT NULL;
ALTER TABLE `school_info` MODIFY COLUMN `principal` varchar(255) NOT NULL DEFAULT '';
ALTER TABLE `school_info` MODIFY COLUMN `address` varchar(255) NOT NULL DEFAULT '';
