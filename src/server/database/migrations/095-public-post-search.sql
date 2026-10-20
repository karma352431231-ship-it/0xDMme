-- Built-in PostgreSQL text search: no extension, external index or text copy.
-- Moderation, blocks and visibility remain predicates of the feed read.
CREATE INDEX community_post_search ON hash_talk.community_posts USING gin
  (to_tsvector('simple'::regconfig, normalize(title || ' ' || text,NFKC)));
