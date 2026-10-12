ALTER TABLE hash_talk.public_profile_follows
 ADD COLUMN notifications boolean NOT NULL DEFAULT false,
 ADD COLUMN notification_revision integer NOT NULL DEFAULT 0 CHECK(notification_revision>=0),
 ADD COLUMN notification_since timestamptz,
 ADD CHECK(NOT notifications OR (following AND notification_since IS NOT NULL));
CREATE INDEX public_profile_notifications ON hash_talk.public_profile_follows(follower,target) WHERE notifications AND following;
CREATE TABLE hash_talk.public_notification_reads (
 profile_id uuid NOT NULL REFERENCES hash_talk.public_profiles(id) ON DELETE CASCADE,
 post_id uuid NOT NULL REFERENCES hash_talk.community_posts(id) ON DELETE CASCADE,
 charge integer NOT NULL DEFAULT 128 CHECK(charge=128),
 PRIMARY KEY(profile_id,post_id)
);
CREATE TRIGGER public_notification_read_usage AFTER INSERT OR DELETE ON hash_talk.public_notification_reads FOR EACH ROW EXECUTE FUNCTION hash_talk.track_message_usage();
CREATE TABLE hash_talk.public_reports (
 id uuid PRIMARY KEY,
 reporter uuid NOT NULL REFERENCES hash_talk.public_profiles(id) ON DELETE CASCADE,
 target uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('post','profile')),
 reason text NOT NULL CHECK(length(reason) BETWEEN 1 AND 1000),
 created_at timestamptz(3) NOT NULL DEFAULT clock_timestamp(),
 charge integer GENERATED ALWAYS AS (384+octet_length(reason)) STORED,
 CHECK(reporter<>target OR kind='post')
) WITH (autovacuum_vacuum_scale_factor=0.05,autovacuum_vacuum_threshold=20,autovacuum_analyze_scale_factor=0.05,autovacuum_analyze_threshold=20);
-- Opaque public target IDs retain the complaint after author deletion; no copied content.
CREATE INDEX public_report_page ON hash_talk.public_reports(created_at DESC,id DESC);
CREATE TRIGGER public_report_usage AFTER INSERT OR DELETE ON hash_talk.public_reports FOR EACH ROW EXECUTE FUNCTION hash_talk.track_message_usage();
