-- In-app notices of new followers. A notice lives only while its follow does:
-- unfollowing withdraws it. No backfill of earlier follows and no copied content.
CREATE TABLE hash_talk.public_follow_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient uuid NOT NULL REFERENCES hash_talk.public_profiles(id) ON DELETE CASCADE,
  actor uuid NOT NULL,
  created_at timestamptz(3) NOT NULL DEFAULT clock_timestamp(),
  read boolean NOT NULL DEFAULT false,
  charge integer NOT NULL DEFAULT 256 CHECK(charge=256),
  FOREIGN KEY(actor,recipient) REFERENCES hash_talk.public_profile_follows(follower,target) ON DELETE CASCADE,
  UNIQUE(actor,recipient),
  CHECK(recipient<>actor)
) WITH (autovacuum_vacuum_scale_factor=0.05,autovacuum_vacuum_threshold=20,
  autovacuum_analyze_scale_factor=0.05,autovacuum_analyze_threshold=20);
CREATE INDEX public_follow_notification_page ON hash_talk.public_follow_notifications(recipient,created_at DESC,id DESC);
CREATE TRIGGER content_allocation_source BEFORE INSERT OR UPDATE OR DELETE ON hash_talk.public_follow_notifications
  FOR EACH ROW EXECUTE FUNCTION hash_talk.enforce_allocated_source();
CREATE TRIGGER content_usage_insert AFTER INSERT ON hash_talk.public_follow_notifications
  REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT
  EXECUTE FUNCTION hash_talk.track_statement_content_usage();
CREATE TRIGGER content_usage_delete AFTER DELETE ON hash_talk.public_follow_notifications
  REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT
  EXECUTE FUNCTION hash_talk.track_statement_content_usage();
