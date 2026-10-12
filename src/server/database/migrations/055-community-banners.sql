ALTER TABLE hash_talk.public_moderation DROP CONSTRAINT public_moderation_kind_check;
ALTER TABLE hash_talk.public_moderation ADD CHECK(kind IN ('avatar','profile-banner','community-photo','community-banner','post-media'));
ALTER TABLE hash_talk.communities
 ADD COLUMN pending_banner bytea CHECK(octet_length(pending_banner) BETWEEN 1 AND 3000000),
 ADD COLUMN pending_banner_type text CHECK(pending_banner_type IN ('image/png','image/jpeg')),
 ADD COLUMN pending_banner_review uuid REFERENCES hash_talk.public_moderation(id) ON DELETE SET NULL,
 ADD COLUMN pending_banner_hash text GENERATED ALWAYS AS (encode(sha256(pending_banner),'hex')) STORED,
 ADD CHECK((pending_banner IS NULL)=(pending_banner_type IS NULL));
ALTER TABLE hash_talk.communities DROP COLUMN charge;
ALTER TABLE hash_talk.communities ADD COLUMN charge integer GENERATED ALWAYS AS
 (1024+octet_length(name)+octet_length(description)+octet_length(rules)+coalesce(octet_length(pending_photo),0)+coalesce(octet_length(pending_banner),0)) STORED;
-- Changing the generated formula adds no bytes to existing rows: all banners are initially NULL.
