-- Public profile age is independent of private account registration.
-- Existing profiles have no proven creation date; no invented backfill.
ALTER TABLE hash_talk.public_profiles ADD COLUMN created_at timestamptz(3);
ALTER TABLE hash_talk.public_profiles ALTER COLUMN created_at SET DEFAULT clock_timestamp();
CREATE INDEX public_profile_author_activity ON hash_talk.community_posts(author,created_at DESC,id DESC)
  WHERE NOT deleted AND active_removal IS NULL;

CREATE TABLE hash_talk.public_profile_follows (
  follower uuid NOT NULL REFERENCES hash_talk.public_profiles(id) ON DELETE CASCADE,
  target uuid NOT NULL REFERENCES hash_talk.public_profiles(id) ON DELETE CASCADE,
  following boolean NOT NULL,
  revision integer NOT NULL CHECK(revision>0),
  charge integer NOT NULL DEFAULT 256 CHECK(charge=256),
  PRIMARY KEY(follower,target), CHECK(follower<>target)
) WITH (autovacuum_vacuum_scale_factor=0.05,autovacuum_vacuum_threshold=20,
  autovacuum_analyze_scale_factor=0.05,autovacuum_analyze_threshold=20);
CREATE INDEX public_profile_followers ON hash_talk.public_profile_follows(target) WHERE following;
CREATE TRIGGER public_profile_follow_usage AFTER INSERT OR DELETE OR UPDATE
ON hash_talk.public_profile_follows FOR EACH ROW EXECUTE FUNCTION hash_talk.track_message_usage();

ALTER TABLE hash_talk.public_moderation DROP CONSTRAINT public_moderation_kind_check;
ALTER TABLE hash_talk.public_moderation ADD CHECK(kind IN ('avatar','profile-banner','community-photo','post-media'));
CREATE TABLE hash_talk.public_profile_banners (
  profile_id uuid PRIMARY KEY REFERENCES hash_talk.public_profiles(id) ON DELETE CASCADE,
  revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
  bytes bytea CHECK(octet_length(bytes) BETWEEN 1 AND 3000000),
  type text CHECK(type IN ('image/png','image/jpeg')),
  review uuid REFERENCES hash_talk.public_moderation(id) ON DELETE SET NULL,
  content_hash text GENERATED ALWAYS AS (encode(sha256(bytes),'hex')) STORED,
  charge integer GENERATED ALWAYS AS (256+coalesce(octet_length(bytes),0)) STORED,
  CHECK((bytes IS NULL)=(type IS NULL))
) WITH (autovacuum_vacuum_scale_factor=0.05,autovacuum_vacuum_threshold=20,
  autovacuum_analyze_scale_factor=0.05,autovacuum_analyze_threshold=20);
CREATE TRIGGER public_profile_banner_usage AFTER INSERT OR DELETE OR UPDATE
ON hash_talk.public_profile_banners FOR EACH ROW EXECUTE FUNCTION hash_talk.track_message_usage();
