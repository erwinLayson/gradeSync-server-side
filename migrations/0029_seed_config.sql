-- 0029_seed_config.sql
-- Seeds the baseline configuration rows that the retired consolidated runner
-- (migrate_all.mjs) used to create on every deploy. The schema itself lives in
-- the 0001-0028 per-table migrations; this file only inserts data. Every
-- statement is idempotent (upsert / guarded insert) so it is also safe on a
-- database that previously ran the old runner.

-- Initial feature flags (developer role). The upsert refreshes label/description
-- only and never touches `enabled`, so a developer's chosen state survives.
INSERT INTO `features` (`key`, `label`, `description`, `enabled`) VALUES
  ('reports_analytics', 'Reports & Analytics', 'Admin analytics dashboards covering enrollment, grades and attendance trends.', 1),
  ('reports_generation', 'Report Generation', 'Printable reports: master lists, class rosters, grade sheets and attendance summaries.', 1),
  ('submission_tracker', 'Submission Tracker', 'Quarterly submission workflow for advisers freezing class records (SF10 / Form-137).', 1)
ON DUPLICATE KEY UPDATE label = VALUES(label), description = VALUES(description);

-- Role login switches (developer role). login_developer intentionally does not
-- exist so the developer can never lock themselves out of the system.
INSERT INTO `features` (`key`, `label`, `description`, `enabled`) VALUES
  ('login_admin', 'Admin Logins', 'Master switch for admin account logins. While disabled, no admin can sign in (existing sessions expire naturally).', 1),
  ('login_teacher', 'Teacher Logins', 'Master switch for teacher account logins. While disabled, no teacher can sign in (existing sessions expire naturally).', 1),
  ('login_student', 'Student Logins', 'Master switch for student account logins. While disabled, no student can sign in (existing sessions expire naturally).', 1)
ON DUPLICATE KEY UPDATE label = VALUES(label), description = VALUES(description);

-- Default grading weights (DepEd DO 8 s. 2015). Inserted only when the table is
-- empty so an admin's customization is never overwritten.
INSERT INTO `grading_weight_defaults`
  (`writtenWorkWeight`, `performanceTaskWeight`, `quarterlyAssessmentWeight`, `attendanceWeight`)
SELECT 20.00, 60.00, 20.00, 0.00
WHERE NOT EXISTS (SELECT 1 FROM `grading_weight_defaults`);

-- Single academic-settings row (quarter 1, 4 quarters, enrollment open,
-- submissions unlocked). Inserted only when the table is empty.
INSERT INTO `academic_settings`
  (`currentQuarter`, `numQuarters`, `enrollmentOpen`, `submissionsLocked`)
SELECT 1, 4, 1, 0
WHERE NOT EXISTS (SELECT 1 FROM `academic_settings`);
