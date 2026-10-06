CREATE TABLE hash_talk.community_tags (
  id uuid PRIMARY KEY,
  community_id uuid NOT NULL REFERENCES hash_talk.communities(id) ON DELETE CASCADE,
  label text NOT NULL CHECK(length(label) BETWEEN 1 AND 36),
  active boolean NOT NULL DEFAULT true,
  revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
  charge integer GENERATED ALWAYS AS (256+octet_length(label)) STORED,
  UNIQUE(community_id,id)
) WITH (autovacuum_vacuum_scale_factor=0.05,autovacuum_vacuum_threshold=20,autovacuum_analyze_scale_factor=0.05,autovacuum_analyze_threshold=20);
CREATE UNIQUE INDEX community_tag_label ON hash_talk.community_tags(community_id,lower(label));
CREATE INDEX community_tag_page ON hash_talk.community_tags(community_id,id);
CREATE TABLE hash_talk.community_posts (
  id uuid PRIMARY KEY,
  community_id uuid NOT NULL REFERENCES hash_talk.communities(id) ON DELETE CASCADE,
  author uuid REFERENCES hash_talk.public_profiles(id) ON DELETE SET NULL,
  title text NOT NULL CHECK(length(title)<=200),
  text text NOT NULL CHECK(length(text)<=4000),
  tag_id uuid,
  created_at timestamptz(3) NOT NULL DEFAULT clock_timestamp(),
  edited_at timestamptz(3),
  revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
  deleted boolean NOT NULL DEFAULT false,
  active_removal uuid,
  charge integer GENERATED ALWAYS AS (768+octet_length(title)+octet_length(text)) STORED,
  UNIQUE(community_id,id),
  FOREIGN KEY(community_id,tag_id) REFERENCES hash_talk.community_tags(community_id,id),
  CHECK((deleted AND title='' AND text='' AND tag_id IS NULL AND active_removal IS NULL) OR (NOT deleted AND length(text)>0))
) WITH (autovacuum_vacuum_scale_factor=0.05,autovacuum_vacuum_threshold=20,autovacuum_analyze_scale_factor=0.05,autovacuum_analyze_threshold=20);
CREATE INDEX community_post_recent ON hash_talk.community_posts(community_id,created_at DESC,id DESC);
CREATE INDEX community_post_tag_recent ON hash_talk.community_posts(community_id,tag_id,created_at DESC,id DESC) WHERE NOT deleted AND active_removal IS NULL;
CREATE INDEX community_post_author_recent ON hash_talk.community_posts(community_id,author,created_at DESC,id DESC);
CREATE TABLE hash_talk.community_post_removals (
  id uuid PRIMARY KEY,
  community_id uuid NOT NULL,
  post_id uuid NOT NULL,
  actor uuid NOT NULL,
  reason text NOT NULL CHECK(length(reason) BETWEEN 1 AND 1000),
  created_at timestamptz(3) NOT NULL DEFAULT clock_timestamp(),
  restored boolean NOT NULL DEFAULT false,
  appeal text CHECK(length(appeal) BETWEEN 1 AND 2000),
  decision text CHECK(length(decision) BETWEEN 1 AND 1000),
  charge integer GENERATED ALWAYS AS (512+octet_length(reason)+coalesce(octet_length(appeal),0)+coalesce(octet_length(decision),0)) STORED,
  UNIQUE(community_id,post_id,id),
  FOREIGN KEY(community_id,post_id) REFERENCES hash_talk.community_posts(community_id,id) ON DELETE CASCADE
) WITH (autovacuum_vacuum_scale_factor=0.05,autovacuum_vacuum_threshold=20,autovacuum_analyze_scale_factor=0.05,autovacuum_analyze_threshold=20);
ALTER TABLE hash_talk.community_posts ADD FOREIGN KEY(community_id,id,active_removal) REFERENCES hash_talk.community_post_removals(community_id,post_id,id);
CREATE INDEX community_post_removal_page ON hash_talk.community_post_removals(community_id,post_id,id);
CREATE TRIGGER community_tag_usage AFTER INSERT OR DELETE OR UPDATE ON hash_talk.community_tags FOR EACH ROW EXECUTE FUNCTION hash_talk.track_message_usage();
CREATE TRIGGER community_post_usage AFTER INSERT OR DELETE OR UPDATE ON hash_talk.community_posts FOR EACH ROW EXECUTE FUNCTION hash_talk.track_message_usage();
CREATE TRIGGER community_post_removal_usage AFTER INSERT OR DELETE OR UPDATE ON hash_talk.community_post_removals FOR EACH ROW EXECUTE FUNCTION hash_talk.track_message_usage();
INSERT INTO hash_talk.community_tags(id,community_id,label)
SELECT gen_random_uuid(),c.id,label FROM hash_talk.communities c CROSS JOIN (VALUES('Discussão'),('Opinião'),('Memes')) defaults(label);
