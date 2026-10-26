-- Metric-owned storage. No wallet, account, device key or browser/page timeline.
CREATE FUNCTION hash_talk.engagement_technical_retention() RETURNS interval LANGUAGE sql IMMUTABLE AS $$
  SELECT interval '7 days';
$$;
CREATE TABLE hash_talk.engagement_state (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  started_at timestamptz(3) NOT NULL DEFAULT clock_timestamp(),
  heartbeat_at timestamptz(3),
  snapshot_at timestamptz(3),
  author_erased_at timestamptz(3),
  community_erased_at timestamptz(3),
  charge integer NOT NULL DEFAULT 512 CHECK(charge=512)
);

CREATE TABLE hash_talk.engagement_counts (
  metric text NOT NULL,
  bucket timestamptz(3) NOT NULL,
  scope text NOT NULL CHECK(scope IN ('project','community','post')),
  entity uuid NOT NULL,
  shard integer NOT NULL CHECK(shard BETWEEN 0 AND 15),
  cause text NOT NULL DEFAULT 'none' CHECK(cause IN ('none','user','cleanup')),
  category text NOT NULL DEFAULT 'all' CHECK(category IN ('all','directory','feed','profile','community','post')),
  value bigint NOT NULL,
  charge integer NOT NULL DEFAULT 256 CHECK(charge=256),
  PRIMARY KEY(metric,bucket,scope,entity,shard,cause,category)
) WITH (autovacuum_vacuum_scale_factor=0.05,autovacuum_vacuum_threshold=20,
  autovacuum_analyze_scale_factor=0.05,autovacuum_analyze_threshold=20);
CREATE INDEX engagement_entity_counts ON hash_talk.engagement_counts(scope,entity,bucket,metric);

-- Current public eligibility is a projection, never a copy of authored content.
CREATE TABLE hash_talk.engagement_entities (
  id uuid NOT NULL,
  kind text NOT NULL CHECK(kind IN ('community','post','reply')),
  scope text GENERATED ALWAYS AS (CASE WHEN kind='community' THEN 'community' ELSE 'post' END) STORED,
  community uuid NOT NULL,
  root uuid,
  parent uuid,
  eligible boolean NOT NULL,
  erased boolean NOT NULL DEFAULT false,
  publication_seen boolean NOT NULL DEFAULT false,
  charge integer NOT NULL DEFAULT 256 CHECK(charge=256),
  PRIMARY KEY(scope,id)
) WITH (autovacuum_vacuum_scale_factor=0.05,autovacuum_vacuum_threshold=20,
  autovacuum_analyze_scale_factor=0.05,autovacuum_analyze_threshold=20);
CREATE INDEX engagement_community_entities ON hash_talk.engagement_entities(community,id);

CREATE TABLE hash_talk.engagement_contributors (
  post uuid PRIMARY KEY,
  community uuid NOT NULL,
  author uuid NOT NULL REFERENCES hash_talk.public_profiles(id) ON DELETE CASCADE,
  published_at timestamptz(3) NOT NULL,
  charge integer NOT NULL DEFAULT 192 CHECK(charge=192)
) WITH (autovacuum_vacuum_scale_factor=0.05,autovacuum_vacuum_threshold=20,
  autovacuum_analyze_scale_factor=0.05,autovacuum_analyze_threshold=20);
CREATE INDEX engagement_contributors_expiry ON hash_talk.engagement_contributors(published_at,post);
CREATE INDEX engagement_contributors_community ON hash_talk.engagement_contributors(community,published_at,author);

CREATE TABLE hash_talk.engagement_visitors (
  marker text PRIMARY KEY CHECK(marker ~ '^[a-f0-9]{64}$'),
  seen_at timestamptz(3) NOT NULL,
  charge integer NOT NULL DEFAULT 192 CHECK(charge=192)
) WITH (autovacuum_vacuum_scale_factor=0.05,autovacuum_vacuum_threshold=20,
  autovacuum_analyze_scale_factor=0.05,autovacuum_analyze_threshold=20);
CREATE INDEX engagement_visitors_expiry ON hash_talk.engagement_visitors(seen_at,marker);

-- Replay protection has no visitor identity or entity reference.
CREATE TABLE hash_talk.engagement_observations (
  id uuid PRIMARY KEY,
  expires_at timestamptz(3) NOT NULL DEFAULT (clock_timestamp()+hash_talk.engagement_technical_retention()),
  charge integer NOT NULL DEFAULT 128 CHECK(charge=128)
) WITH (autovacuum_vacuum_scale_factor=0.05,autovacuum_vacuum_threshold=20,
  autovacuum_analyze_scale_factor=0.05,autovacuum_analyze_threshold=20);
CREATE INDEX engagement_observations_expiry ON hash_talk.engagement_observations(expires_at,id);

CREATE TABLE hash_talk.engagement_erasure (
  id uuid NOT NULL,
  scope text NOT NULL CHECK(scope IN ('community','post')),
  charge integer NOT NULL DEFAULT 128 CHECK(charge=128),
  PRIMARY KEY(scope,id)
);
CREATE TABLE hash_talk.engagement_snapshots (
  cutoff timestamptz(3) NOT NULL,
  period text NOT NULL CHECK(period IN ('day','week','month')),
  metric text NOT NULL,
  scope text NOT NULL CHECK(scope IN ('project','community')),
  entity uuid NOT NULL,
  value bigint NOT NULL CHECK(value>=0),
  complete boolean NOT NULL,
  charge integer NOT NULL DEFAULT 256 CHECK(charge=256),
  PRIMARY KEY(cutoff,period,metric,scope,entity)
);

-- Called only by accepted domain facts and validated browser admission.
-- Shards avoid a single project counter row; the existing global capacity
-- ledger still applies and remains an acknowledged throughput constraint.
CREATE FUNCTION hash_talk.record_engagement(
  name text, community_id uuid, post_id uuid, amount bigint DEFAULT 1,
  removal_cause text DEFAULT 'none', page_category text DEFAULT 'all'
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  at timestamptz := date_trunc('minute',clock_timestamp());
  part integer := (hashtextextended(coalesce(post_id::text,gen_random_uuid()::text),0)&15)::integer;
BEGIN
  IF amount=0 THEN RETURN; END IF;
  INSERT INTO hash_talk.engagement_counts(metric,bucket,scope,entity,shard,cause,category,value)
    SELECT name,at,s.scope,s.entity,part,removal_cause,page_category,amount
    FROM (VALUES ('project','00000000-0000-0000-0000-000000000000'::uuid),
      ('community',community_id),('post',post_id)) s(scope,entity)
    WHERE s.entity IS NOT NULL ORDER BY s.scope,s.entity
    ON CONFLICT(metric,bucket,scope,entity,shard,cause,category)
    DO UPDATE SET value=hash_talk.engagement_counts.value+excluded.value;
END;
$$;

-- Reuse main's statement accounting. Fixed row charges do not change on UPDATE.
DO $$
DECLARE name text;
BEGIN
  FOREACH name IN ARRAY ARRAY['engagement_state','engagement_counts','engagement_entities',
    'engagement_contributors','engagement_visitors','engagement_observations',
    'engagement_erasure','engagement_snapshots'] LOOP
    EXECUTE format('CREATE TRIGGER content_usage_insert AFTER INSERT ON hash_talk.%I REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION hash_talk.track_statement_content_usage()',name);
    EXECUTE format('CREATE TRIGGER content_usage_delete AFTER DELETE ON hash_talk.%I REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION hash_talk.track_statement_content_usage()',name);
  END LOOP;
END;
$$;
INSERT INTO hash_talk.engagement_state(singleton) VALUES(true);
