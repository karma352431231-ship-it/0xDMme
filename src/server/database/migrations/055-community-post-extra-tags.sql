-- Posts may carry up to five community tags. community_posts.tag_id keeps the
-- first one (existing indexes, views and rows stay untouched); the others are
-- stored here in order. The table starts empty: no existing row is rewritten.
CREATE TABLE hash_talk.community_post_extra_tags (
  community_id uuid NOT NULL,
  post_id uuid NOT NULL,
  tag_id uuid NOT NULL,
  position smallint NOT NULL CHECK(position BETWEEN 1 AND 4),
  charge integer NOT NULL DEFAULT 64 CHECK(charge=64),
  PRIMARY KEY(post_id,tag_id),
  UNIQUE(post_id,position),
  FOREIGN KEY(community_id,post_id) REFERENCES hash_talk.community_posts(community_id,id) ON DELETE CASCADE,
  FOREIGN KEY(community_id,tag_id) REFERENCES hash_talk.community_tags(community_id,id)
) WITH (autovacuum_vacuum_scale_factor=0.05,autovacuum_vacuum_threshold=20,
  autovacuum_analyze_scale_factor=0.05,autovacuum_analyze_threshold=20);
CREATE INDEX community_post_extra_tag_filter ON hash_talk.community_post_extra_tags(community_id,tag_id,post_id);
CREATE TRIGGER community_post_extra_tag_usage AFTER INSERT OR DELETE OR UPDATE
ON hash_talk.community_post_extra_tags FOR EACH ROW EXECUTE FUNCTION hash_talk.track_message_usage();
-- Text becomes optional for a titled post: content is a title, text or media.
-- The rule only loosens, so every existing row still satisfies it.
ALTER TABLE hash_talk.community_posts DROP CONSTRAINT community_post_content;
ALTER TABLE hash_talk.community_posts ADD CONSTRAINT community_post_content CHECK(
  cardinality(media_ids)<=4 AND
  ((deleted AND title='' AND text='' AND tag_id IS NULL AND active_removal IS NULL AND cardinality(media_ids)=0)
   OR (NOT deleted AND (length(title)>0 OR length(text)>0 OR cardinality(media_ids)>0)))
);
