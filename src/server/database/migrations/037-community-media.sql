-- Public media stays restricted. No personal-vault or community quota charge.
ALTER TABLE hash_talk.community_posts ADD COLUMN media_ids uuid[] NOT NULL DEFAULT '{}';
ALTER TABLE hash_talk.community_posts DROP CONSTRAINT community_posts_check;
ALTER TABLE hash_talk.community_posts ADD CONSTRAINT community_post_content CHECK(
  cardinality(media_ids)<=4 AND
  ((deleted AND title='' AND text='' AND tag_id IS NULL AND active_removal IS NULL AND cardinality(media_ids)=0)
   OR (NOT deleted AND (length(text)>0 OR cardinality(media_ids)>0)))
);
CREATE TABLE hash_talk.community_media (
  id uuid PRIMARY KEY,
  community_id uuid NOT NULL REFERENCES hash_talk.communities(id),
  author uuid REFERENCES hash_talk.public_profiles(id) ON DELETE SET NULL,
  source jsonb NOT NULL,
  post_id uuid,
  status text NOT NULL DEFAULT 'uploading' CHECK(status IN ('uploading','processing','ready','attached','deleting')),
  received text[] NOT NULL DEFAULT '{}',
  writer uuid,
  result jsonb,
  error text CHECK(length(error)<=240),
  expires_at timestamptz NOT NULL DEFAULT now()+interval '24 hours',
  charge bigint NOT NULL CHECK(charge>0),
  FOREIGN KEY(community_id,post_id) REFERENCES hash_talk.community_posts(community_id,id),
  CHECK((status='attached')=(post_id IS NOT NULL)),
  CHECK(status NOT IN ('ready','attached') OR result IS NOT NULL)
) WITH (autovacuum_vacuum_scale_factor=0.05,autovacuum_vacuum_threshold=20,autovacuum_analyze_scale_factor=0.05,autovacuum_analyze_threshold=20);
CREATE INDEX community_media_temporary ON hash_talk.community_media(expires_at,id) WHERE post_id IS NULL;
CREATE INDEX community_media_post ON hash_talk.community_media(post_id) WHERE post_id IS NOT NULL;
CREATE TRIGGER community_media_usage AFTER INSERT OR DELETE OR UPDATE OF charge ON hash_talk.community_media FOR EACH ROW EXECUTE FUNCTION hash_talk.track_message_usage();
