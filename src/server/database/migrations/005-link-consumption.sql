-- Keep cancelled/consumed requests until their original signed deadline.
-- Cleanup after that deadline is safe because the signed code cannot renew it.
ALTER TABLE hash_talk.device_links ADD COLUMN cancelled boolean NOT NULL DEFAULT false;
