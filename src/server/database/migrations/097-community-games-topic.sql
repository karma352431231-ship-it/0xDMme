-- Extend the accepted topic catalog without changing existing fixed topics.
DO $$
DECLARE topic_constraint text;
BEGIN
  SELECT conname INTO STRICT topic_constraint FROM pg_constraint
    WHERE conrelid='hash_talk.community_classifications'::regclass
      AND contype='c' AND pg_get_constraintdef(oid) LIKE '%topics <@%';
  EXECUTE format('ALTER TABLE hash_talk.community_classifications DROP CONSTRAINT %I', topic_constraint);
END;
$$;
ALTER TABLE hash_talk.community_classifications
  ADD CONSTRAINT community_classification_known_topics
  CHECK(topics <@ ARRAY['ai','cat','dog','meme','tech','stock','chinese','brainrot','celebrity','nft','tiktok','games']::text[]);
