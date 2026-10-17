-- Match the approved 10,000,000-byte group file to its 262,144-byte parts.
-- Applied migrations remain unchanged; existing twelve-part progress is retained.
ALTER TABLE hash_talk.group_media DROP CONSTRAINT group_media_received_check;
ALTER TABLE hash_talk.group_media ADD CONSTRAINT group_media_received_check
  CHECK(cardinality(received)<=39) NOT VALID;
ALTER TABLE hash_talk.group_media VALIDATE CONSTRAINT group_media_received_check;
