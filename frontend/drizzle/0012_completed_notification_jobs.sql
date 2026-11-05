-- Completion callbacks already use this status in the application. Retain every
-- historical job kind, including draft recovery, while admitting completed.
ALTER TABLE notification_jobs DROP CONSTRAINT notification_jobs_kind_check;
ALTER TABLE notification_jobs ADD CONSTRAINT notification_jobs_kind_check
 CHECK (kind IN ('confirmed','preparing','ready','completed','payment_link','draft_recovery'));
