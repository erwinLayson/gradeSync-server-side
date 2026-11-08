-- 0043_consolidate_student_details.sql
-- Consolidate student_details 1:1 table into students

-- 1. Add guardian, address, and personal fields directly to students
ALTER TABLE `students`
ADD COLUMN IF NOT EXISTS `birthplace` varchar(255) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS `permanentAddress` varchar(255) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS `religion` varchar(100) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS `contactNumber` varchar(30) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS `guardianName` varchar(255) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS `guardianRelation` varchar(50) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS `guardianContact` varchar(30) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS `guardianOccupation` varchar(100) DEFAULT NULL;

-- 2. Migrate existing details if any rows exist
UPDATE `students` s
JOIN `student_details` sd ON s.id = sd.studentId
SET 
  s.birthplace = sd.birthplace,
  s.permanentAddress = sd.permanentAddress,
  s.religion = sd.religion,
  s.contactNumber = sd.contactNumber,
  s.guardianName = sd.guardianName,
  s.guardianRelation = sd.guardianRelation,
  s.guardianContact = sd.guardianContact,
  s.guardianOccupation = sd.guardianOccupation;

-- 3. Drop the redundant student_details table
DROP TABLE IF EXISTS `student_details`;

