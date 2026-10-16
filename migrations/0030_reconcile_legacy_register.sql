-- 0030_reconcile_legacy_register.sql
-- Reconcile legacy `users.role='register'` accounts onto the faculty model.
-- Register is no longer a user role: register staff sign in with role
-- 'teacher' and are distinguished by their `faculties.role`. Only accounts with
-- exactly one valid linked faculty row are converted; accounts with no linked
-- faculty record, multiple records, or an invalid faculty role are left
-- untouched for manual review (same rule the retired `migrate_all.mjs` step 23
-- applied). Idempotent: a second run matches no `register` rows.
UPDATE `users` u
JOIN (
    SELECT `userId`
    FROM `faculties`
    WHERE `role` IN ('teacher','register')
    GROUP BY `userId`
    HAVING COUNT(*) = 1
) f ON f.`userId` = u.`id`
SET u.`role` = 'teacher'
WHERE u.`role` = 'register';
