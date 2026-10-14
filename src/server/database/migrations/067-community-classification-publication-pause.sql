-- Classify only communities created after this release. Existing rows stay untouched.
CREATE TABLE hash_talk.community_classifications (
  community_id uuid PRIMARY KEY REFERENCES hash_talk.communities(id) ON DELETE CASCADE,
  nsfw boolean NOT NULL DEFAULT false,
  topics text[] NOT NULL DEFAULT '{}',
  charge integer NOT NULL DEFAULT 256 CHECK(charge=256),
  CHECK(cardinality(topics)=0 OR (array_ndims(topics)=1 AND array_lower(topics,1)=1)),
  CHECK(cardinality(topics)<=2 AND array_position(topics,NULL) IS NULL),
  CHECK(topics <@ ARRAY['ai','cat','dog','meme','tech','stock','chinese','brainrot','celebrity','nft','tiktok']::text[]),
  CHECK(cardinality(topics)<2 OR topics[1]<>topics[2])
) WITH (autovacuum_vacuum_scale_factor=0.05,autovacuum_vacuum_threshold=20,
  autovacuum_analyze_scale_factor=0.05,autovacuum_analyze_threshold=20);
CREATE INDEX community_classification_topics ON hash_talk.community_classifications USING gin(topics);
CREATE FUNCTION hash_talk.fixed_community_topics() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.community_id<>OLD.community_id OR NEW.topics IS DISTINCT FROM OLD.topics THEN
    RAISE EXCEPTION 'Community topics cannot be changed after creation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER community_classification_fixed BEFORE UPDATE ON hash_talk.community_classifications
  FOR EACH ROW EXECUTE FUNCTION hash_talk.fixed_community_topics();
CREATE TRIGGER community_classification_usage AFTER INSERT OR DELETE OR UPDATE ON hash_talk.community_classifications
  FOR EACH ROW EXECUTE FUNCTION hash_talk.track_message_usage();

-- An unreviewed release is explicit audit data, never a fabricated model/operator verdict.
ALTER TABLE hash_talk.public_moderation ADD COLUMN publication_mode text NOT NULL DEFAULT 'analysis'
  CHECK(publication_mode IN ('analysis','unreviewed'));
DO $$
DECLARE evidence_constraint text;
BEGIN
  SELECT conname INTO STRICT evidence_constraint FROM pg_constraint
    WHERE conrelid='hash_talk.public_moderation'::regclass AND contype='c'
      AND pg_get_constraintdef(oid) LIKE '%status%approved%operator_verdict%model_hash%';
  EXECUTE format('ALTER TABLE hash_talk.public_moderation DROP CONSTRAINT %I',evidence_constraint);
END;
$$;
ALTER TABLE hash_talk.public_moderation ADD CONSTRAINT public_moderation_review_evidence CHECK(
  status NOT IN ('approved','rejected','held') OR
  (publication_mode='unreviewed' AND status='approved') OR operator_verdict IS NOT NULL OR
  (model_hash IS NOT NULL AND runtime IS NOT NULL AND frames IS NOT NULL AND automatic_verdict IS NOT NULL));
ALTER TABLE hash_talk.public_moderation ADD CONSTRAINT public_moderation_unreviewed_evidence CHECK(
  publication_mode<>'unreviewed' OR
  (status IN ('approved','removed') AND model_hash IS NULL AND runtime IS NULL AND frames IS NULL
    AND automatic_verdict IS NULL AND completed_lease IS NULL AND operator_verdict IS NULL AND lease IS NULL));
