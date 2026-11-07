-- 0039_add_in_progress_amendment_status.sql
-- Expand amendment_requests status enum to include 'in_progress'

ALTER TABLE `amendment_requests` 
MODIFY COLUMN `status` enum('pending','approved','in_progress','rejected','completed','expired','revoked') NOT NULL DEFAULT 'pending';

