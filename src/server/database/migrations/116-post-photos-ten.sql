-- Posts and replies hold up to 10 photos (owner decision 25/11/2026); GIFs
-- stay at 3 and video at 1. The rule only loosens, so every existing row
-- still satisfies it.
ALTER TABLE hash_talk.community_posts DROP CONSTRAINT community_post_content;
ALTER TABLE hash_talk.community_posts ADD CONSTRAINT community_post_content CHECK(
  cardinality(media_ids)<=10 AND
  ((deleted AND title='' AND text='' AND tag_id IS NULL AND active_removal IS NULL AND cardinality(media_ids)=0)
   OR (NOT deleted AND (length(title)>0 OR length(text)>0 OR cardinality(media_ids)>0)))
);
