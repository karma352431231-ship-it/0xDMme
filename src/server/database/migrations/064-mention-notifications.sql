-- References only: text and labels are read from the current public source.
CREATE TABLE hash_talk.public_mention_notifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 recipient uuid NOT NULL REFERENCES hash_talk.public_profiles(id) ON DELETE CASCADE,
 actor uuid NOT NULL REFERENCES hash_talk.public_profiles(id) ON DELETE CASCADE,
 source_post uuid REFERENCES hash_talk.community_posts(id) ON DELETE CASCADE,
 source_profile uuid REFERENCES hash_talk.public_profiles(id) ON DELETE CASCADE,
 source_community uuid REFERENCES hash_talk.communities(id) ON DELETE CASCADE,
 created_at timestamptz(3) NOT NULL DEFAULT clock_timestamp(),
 read boolean NOT NULL DEFAULT false,
 charge integer NOT NULL DEFAULT 384 CHECK(charge=384),
 CHECK(recipient<>actor),
 CHECK(num_nonnulls(source_post,source_profile,source_community)=1)
) WITH (autovacuum_vacuum_scale_factor=0.05,autovacuum_vacuum_threshold=20,autovacuum_analyze_scale_factor=0.05,autovacuum_analyze_threshold=20);
CREATE UNIQUE INDEX mention_notification_post ON hash_talk.public_mention_notifications(recipient,source_post) WHERE source_post IS NOT NULL;
CREATE UNIQUE INDEX mention_notification_profile ON hash_talk.public_mention_notifications(recipient,source_profile) WHERE source_profile IS NOT NULL;
CREATE UNIQUE INDEX mention_notification_community ON hash_talk.public_mention_notifications(recipient,source_community) WHERE source_community IS NOT NULL;
CREATE INDEX mention_notification_inbox ON hash_talk.public_mention_notifications(recipient,created_at DESC,id DESC);
CREATE INDEX mention_notification_post_source ON hash_talk.public_mention_notifications(source_post) WHERE source_post IS NOT NULL;
CREATE INDEX mention_notification_profile_source ON hash_talk.public_mention_notifications(source_profile) WHERE source_profile IS NOT NULL;
CREATE INDEX mention_notification_community_source ON hash_talk.public_mention_notifications(source_community) WHERE source_community IS NOT NULL;
CREATE TRIGGER mention_notification_usage AFTER INSERT OR DELETE OR UPDATE ON hash_talk.public_mention_notifications FOR EACH ROW EXECUTE FUNCTION hash_talk.track_message_usage();
