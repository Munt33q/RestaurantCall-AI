-- Do not dispatch an obsolete stage after newer signed provider evidence arrives.
ALTER TABLE telephone_commands ADD COLUMN stage_nonce text;
UPDATE telephone_commands SET status='uncertain' WHERE status IN ('pending','sending');
ALTER TABLE telephone_commands DROP CONSTRAINT telephone_commands_status_check;
ALTER TABLE telephone_commands ADD CONSTRAINT telephone_commands_status_check
 CHECK (status IN ('pending','sending','sent','uncertain','superseded'));
