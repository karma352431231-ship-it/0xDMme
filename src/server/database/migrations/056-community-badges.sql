-- Unknown historical membership dates stay unknown; only future follows start a badge window.
ALTER TABLE hash_talk.community_follows ADD COLUMN joined_at timestamptz;
ALTER TABLE hash_talk.community_follows ALTER COLUMN joined_at SET DEFAULT clock_timestamp();
INSERT INTO hash_talk.community_follows(community_id,profile_id,joined_at)
 SELECT id,owner,NULL FROM hash_talk.communities WHERE owner IS NOT NULL ON CONFLICT DO NOTHING;
CREATE TABLE hash_talk.community_badges (
 id uuid PRIMARY KEY,
 community_id uuid NOT NULL REFERENCES hash_talk.communities(id) ON DELETE CASCADE,
 label text NOT NULL CHECK(length(label) BETWEEN 1 AND 32),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 charge integer GENERATED ALWAYS AS (256+octet_length(label)) STORED,
 UNIQUE(community_id,id)
) WITH (autovacuum_vacuum_scale_factor=0.05,autovacuum_vacuum_threshold=20,autovacuum_analyze_scale_factor=0.05,autovacuum_analyze_threshold=20);
CREATE TABLE hash_talk.community_member_badges (
 community_id uuid NOT NULL,
 profile_id uuid NOT NULL REFERENCES hash_talk.public_profiles(id) ON DELETE CASCADE,
 badge_id uuid NOT NULL,
 charge integer NOT NULL DEFAULT 128 CHECK(charge=128),
 PRIMARY KEY(badge_id,profile_id),
 FOREIGN KEY(community_id,badge_id) REFERENCES hash_talk.community_badges(community_id,id) ON DELETE CASCADE
);
CREATE INDEX community_badge_member ON hash_talk.community_member_badges(community_id,profile_id,badge_id);
CREATE TRIGGER community_badge_usage AFTER INSERT OR DELETE OR UPDATE ON hash_talk.community_badges FOR EACH ROW EXECUTE FUNCTION hash_talk.track_message_usage();
CREATE TRIGGER community_member_badge_usage AFTER INSERT OR DELETE ON hash_talk.community_member_badges FOR EACH ROW EXECUTE FUNCTION hash_talk.track_message_usage();
