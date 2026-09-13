-- Migration: Create landing_content table + seed the 7 sections
-- Date: 2026-09-15
-- Purpose: Developer-managed landing page content (docs/landing-content-plan.md).
--          One row per section; content is a validated JSON blob.
--          Prefer `npm run migrate` (migrate_all.mjs step 18) — it is idempotent.

CREATE TABLE IF NOT EXISTS `landing_content` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `section` varchar(64) NOT NULL,
  `content` json NOT NULL,
  `updatedBy` bigint(20) DEFAULT NULL,
  `updatedAt` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `landing_content_section_unique` (`section`),
  KEY `fk_landing_content_updated_by` (`updatedBy`),
  CONSTRAINT `fk_landing_content_updated_by` FOREIGN KEY (`updatedBy`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Seed with the current hardcoded landing content so the DB starts in sync
-- with the page. Hero slide paths are the stable public asset URLs
-- (client/public/assets), not Vite's hashed bundle paths.
-- Idempotent: re-running refreshes content instead of failing on the unique key.

INSERT INTO `landing_content` (`section`, `content`) VALUES ('hero', '{"slides":[{"image":"/assets/hero-1.svg","label":"School campus"},{"image":"/assets/hero-2.svg","label":"Classroom learning"},{"image":"/assets/hero-3.svg","label":"Student graduation"}],"title":"School records,","titleAccent":" simplified.","subtitle":"Abang Suizu Integrated School runs on GradeSync — one system for grading, attendance, class submission and official school records, all in one place."}')
ON DUPLICATE KEY UPDATE `content` = VALUES(`content`);

INSERT INTO `landing_content` (`section`, `content`) VALUES ('stats', '{"rows":[{"value":"3","label":"Roles, one system"},{"value":"4","label":"Quarters tracked"},{"value":"100%","label":"Digital records"},{"value":"SF10","label":"Ready submissions"}]}')
ON DUPLICATE KEY UPDATE `content` = VALUES(`content`);

INSERT INTO `landing_content` (`section`, `content`) VALUES ('about', '{"heading":{"eyebrow":"About Us","title":"A complete academic record system","text":"Abang Suizu Integrated School uses GradeSync to keep academic records accurate, organized and up to date — from daily attendance to the quarterly submission of official student records (SF10 / Form-137)."},"features":[{"iconKey":"FaUserGraduate","title":"Student Records","text":"Every learner''s profile, enrollment and class placement in one place."},{"iconKey":"FaClipboardCheck","title":"Grading & Attendance","text":"Quarter grades computed automatically from teacher-entered scores and attendance."},{"iconKey":"FaBookOpen","title":"Class Submission","text":"Advisers review and submit frozen student records each quarter for SF10 / Form-137."},{"iconKey":"FaChartLine","title":"Reports & Analytics","text":"Dashboards for admins, report cards for teachers and prospects for students."}]}')
ON DUPLICATE KEY UPDATE `content` = VALUES(`content`);

INSERT INTO `landing_content` (`section`, `content`) VALUES ('how_it_works', '{"heading":{"eyebrow":"How it works","title":"From enrollment to Form-137","text":"Four steps connect the school office, the classrooms and every learner''s permanent record."},"steps":[{"step":"01","title":"Enroll the learner","text":"Admins record student information and place them in a class for the school year."},{"step":"02","title":"Record daily progress","text":"Teachers take attendance and encode scores in the gradebook as classes happen."},{"step":"03","title":"Grades compute themselves","text":"Quarterly grades are calculated automatically against the school''s grading weights."},{"step":"04","title":"Submit official records","text":"Advisers review, freeze and submit class records for SF10 / Form-137 printing."}]}')
ON DUPLICATE KEY UPDATE `content` = VALUES(`content`);

INSERT INTO `landing_content` (`section`, `content`) VALUES ('audiences', '{"heading":{"eyebrow":"Who it''s for","title":"Built for every role in school","text":"Each role gets a workspace with exactly the tools it needs — nothing more, nothing missing."},"cards":[{"iconKey":"FaSchool","title":"For Administrators","text":"See the whole school at a glance and keep records moving.","points":["Enrollment and records oversight","School-wide reports and analytics","Academic settings control"]},{"iconKey":"FaChalkboardTeacher","title":"For Teachers","text":"Spend less time on paperwork, more time teaching.","points":["Fast attendance taking","Gradebook with auto-computed grades","One-click class record submission"]},{"iconKey":"FaUserGraduate","title":"For Students","text":"Your school life, visible in one place.","points":["Profile and class schedule","Grades per quarter","Subject prospectus tracking"]}]}')
ON DUPLICATE KEY UPDATE `content` = VALUES(`content`);

INSERT INTO `landing_content` (`section`, `content`) VALUES ('contact', '{"heading":{"eyebrow":"Contact Us","title":"Reach the school office","text":"For login help or questions about records, get in touch with the school office during office hours."},"items":[{"iconKey":"FiMapPin","title":"Address","lines":["Abang Suizu Integrated School","Your School Address Here"]},{"iconKey":"FiMail","title":"Email","lines":["admin@abangsuizu.edu.ph"]},{"iconKey":"FiPhone","title":"Phone","lines":["(000) 000-0000"]},{"iconKey":"FiClock","title":"Office Hours","lines":["Mon – Fri, 8:00 AM – 5:00 PM"]}]}')
ON DUPLICATE KEY UPDATE `content` = VALUES(`content`);

INSERT INTO `landing_content` (`section`, `content`) VALUES ('cta', '{"title":"Ready to simplify school records?","text":"Sign in with your school account — admins, teachers and students all use the same door."}')
ON DUPLICATE KEY UPDATE `content` = VALUES(`content`);
