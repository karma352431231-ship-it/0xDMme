-- Public share counts are read for one bounded page of posts at a time.
CREATE INDEX community_post_share_counts
  ON hash_talk.community_post_shares(post_id) WHERE shared;
