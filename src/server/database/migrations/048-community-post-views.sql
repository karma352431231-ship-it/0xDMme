ALTER TABLE hash_talk.community_posts ADD COLUMN views bigint NOT NULL DEFAULT 0
  CHECK(views>=0 AND views<=9007199254740991);
CREATE TABLE hash_talk.community_post_view_marks (
  post_id uuid NOT NULL REFERENCES hash_talk.community_posts(id) ON DELETE CASCADE,
  viewer_hash text NOT NULL CHECK(viewer_hash ~ '^[a-f0-9]{64}$'),
  charge integer NOT NULL DEFAULT 128 CHECK(charge=128),
  PRIMARY KEY(post_id,viewer_hash)
) WITH (autovacuum_vacuum_scale_factor=0.05,autovacuum_vacuum_threshold=20,
        autovacuum_analyze_scale_factor=0.05,autovacuum_analyze_threshold=20);
CREATE TRIGGER community_view_usage AFTER INSERT OR DELETE ON hash_talk.community_post_view_marks
  FOR EACH ROW EXECUTE FUNCTION hash_talk.track_message_usage();
-- Views are public display metadata, not a new signal in ranking version 1.
DROP TRIGGER community_ranking_post_changed ON hash_talk.community_posts;
CREATE TRIGGER community_ranking_post_changed AFTER INSERT OR DELETE OR UPDATE OF
  community_id,author,title,text,tag_id,created_at,edited_at,revision,deleted,
  active_removal,parent_id,root_id,score,replies,media_ids
  ON hash_talk.community_posts FOR EACH ROW EXECUTE FUNCTION hash_talk.mark_community_ranking();
