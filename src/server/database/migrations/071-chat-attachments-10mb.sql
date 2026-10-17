-- Private and group chat attachments up to 10 MB (owner request, 16/10/2026).
-- `@` DM and status media keep their 3 MB checks. Existing rows already satisfy
-- the wider bound; validation only confirms them.
ALTER TABLE hash_talk.message_attachments DROP CONSTRAINT message_attachments_bytes_check;
ALTER TABLE hash_talk.message_attachments ADD CONSTRAINT message_attachments_bytes_check
  CHECK(bytes BETWEEN 1 AND 10000000) NOT VALID;
ALTER TABLE hash_talk.message_attachments VALIDATE CONSTRAINT message_attachments_bytes_check;
ALTER TABLE hash_talk.group_media DROP CONSTRAINT group_media_bytes_check;
ALTER TABLE hash_talk.group_media ADD CONSTRAINT group_media_bytes_check
  CHECK(bytes BETWEEN 1 AND 10000000) NOT VALID;
ALTER TABLE hash_talk.group_media VALIDATE CONSTRAINT group_media_bytes_check;
