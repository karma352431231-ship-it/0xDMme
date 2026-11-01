-- Engagement facts and the global capacity ledger must be locked in one order.
-- The browser collector and maintenance already guard the ledger before metric
-- rows; domain fact triggers inserted counter rows first and reached the ledger
-- only in the statement trigger, so a fact holding a new counter could wait on
-- the ledger while the ledger holder waited on that counter, until the 1 s lock
-- timeout. record_engagement now guards the ledger first (a reserved
-- allocation keeps its partition path); writes and charges are unchanged.
CREATE OR REPLACE FUNCTION hash_talk.record_engagement(
  name text, community_id uuid, post_id uuid, amount bigint DEFAULT 1,
  removal_cause text DEFAULT 'none', page_category text DEFAULT 'all'
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  at timestamptz := date_trunc('minute',clock_timestamp());
  part integer := (hashtextextended(coalesce(post_id::text,gen_random_uuid()::text),0)&15)::integer;
BEGIN
  IF amount=0 THEN RETURN; END IF;
  IF NOT hash_talk.guard_content_usage() THEN
    RAISE EXCEPTION 'Global quota accounting unavailable';
  END IF;
  INSERT INTO hash_talk.engagement_counts(metric,bucket,scope,entity,shard,cause,category,value)
    SELECT name,at,s.scope,s.entity,part,removal_cause,page_category,amount
    FROM (VALUES ('project','00000000-0000-0000-0000-000000000000'::uuid),
      ('community',community_id),('post',post_id)) s(scope,entity)
    WHERE s.entity IS NOT NULL ORDER BY s.scope,s.entity
    ON CONFLICT(metric,bucket,scope,entity,shard,cause,category)
    DO UPDATE SET value=hash_talk.engagement_counts.value+excluded.value;
END;
$$;

-- An account row without a profile has no charge, so before 101 signing in
-- never touched the ledger. The account fact now runs at commit: identical
-- writes, accounting and atomicity, with the ledger held only while the sign-in
-- commits instead of from the account insert onward.
DROP TRIGGER engagement_account_fact ON hash_talk.accounts;
CREATE CONSTRAINT TRIGGER engagement_account_fact AFTER INSERT OR DELETE ON hash_talk.accounts
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION hash_talk.engagement_account_fact('accounts');
