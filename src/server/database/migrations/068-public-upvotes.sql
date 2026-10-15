-- Active arrivals only. No historical vote backfill and no copied content.
CREATE TABLE hash_talk.public_upvote_notifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 recipient uuid NOT NULL REFERENCES hash_talk.public_profiles(id) ON DELETE CASCADE,
 actor uuid NOT NULL,
 post_id uuid NOT NULL,
 created_at timestamptz(3) NOT NULL DEFAULT clock_timestamp(),
 read boolean NOT NULL DEFAULT false,
 charge integer NOT NULL DEFAULT 384 CHECK(charge=384),
 FOREIGN KEY(actor,post_id) REFERENCES hash_talk.community_votes(profile_id,post_id) ON DELETE CASCADE,
 UNIQUE(actor,post_id),
 CHECK(recipient<>actor)
) WITH (autovacuum_vacuum_scale_factor=0.05,autovacuum_vacuum_threshold=20,autovacuum_analyze_scale_factor=0.05,autovacuum_analyze_threshold=20);
CREATE INDEX public_upvote_notification_page ON hash_talk.public_upvote_notifications(recipient,created_at DESC,id DESC);
CREATE INDEX public_upvote_voters ON hash_talk.community_votes(post_id,profile_id DESC) WHERE position=1;
CREATE TRIGGER public_upvote_notification_usage AFTER INSERT OR DELETE OR UPDATE ON hash_talk.public_upvote_notifications FOR EACH ROW EXECUTE FUNCTION hash_talk.track_message_usage();
