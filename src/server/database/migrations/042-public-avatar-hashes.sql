-- Read projections bind approval to current bytes without loading every candidate
-- into the web process. Generated hashes also change on any coordinated replacement.
ALTER TABLE hash_talk.public_profiles ADD COLUMN pending_avatar_hash text
  GENERATED ALWAYS AS (encode(sha256(pending_avatar),'hex')) STORED;
ALTER TABLE hash_talk.communities ADD COLUMN pending_photo_hash text
  GENERATED ALWAYS AS (encode(sha256(pending_photo),'hex')) STORED;
