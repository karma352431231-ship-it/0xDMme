-- Operational records contain aggregate measurements, never request identities.
ALTER TABLE hash_talk.engagement_state
  ADD COLUMN correction_revision bigint NOT NULL DEFAULT 1,
  ADD COLUMN snapshot_generation bigint NOT NULL DEFAULT 0,
  ADD COLUMN contributors_reset_at timestamptz(3),
  ADD COLUMN maintenance_failures bigint NOT NULL DEFAULT 0,
  ADD COLUMN pending_maintenance_failures bigint NOT NULL DEFAULT 0,
  ADD COLUMN maintenance_failed_at timestamptz(3),
  ADD COLUMN pending_gap_from timestamptz(3),
  ADD COLUMN pending_gap_to timestamptz(3);

CREATE TABLE hash_talk.engagement_coverage (
  day date NOT NULL,
  reason text NOT NULL CHECK(reason IN ('collection_failure','maintenance_gap','snapshot_failure')),
  started_at timestamptz(3) NOT NULL,
  ended_at timestamptz(3) NOT NULL,
  occurrences bigint NOT NULL CHECK(occurrences>0),
  charge integer NOT NULL DEFAULT 256 CHECK(charge=256),
  PRIMARY KEY(day,reason), CHECK(ended_at>=started_at)
);
CREATE INDEX engagement_coverage_interval ON hash_talk.engagement_coverage(ended_at,started_at);

CREATE TABLE hash_talk.engagement_operations (
  id uuid PRIMARY KEY,
  revision bigint NOT NULL UNIQUE,
  kind text NOT NULL CHECK(kind IN ('reconciliation','traffic','snapshot')),
  reason text NOT NULL CHECK(reason IN ('source_reconciliation','invalid_traffic','measurement_error')),
  recorded_at timestamptz(3) NOT NULL DEFAULT clock_timestamp(),
  charge integer NOT NULL DEFAULT 256 CHECK(charge=256)
);
CREATE TABLE hash_talk.engagement_adjustments (
  operation uuid NOT NULL REFERENCES hash_talk.engagement_operations(id),
  metric text NOT NULL,
  bucket timestamptz(3) NOT NULL,
  scope text NOT NULL CHECK(scope IN ('project','community','post')),
  entity uuid NOT NULL,
  delta bigint NOT NULL CHECK(delta<>0),
  charge integer NOT NULL DEFAULT 256 CHECK(charge=256),
  PRIMARY KEY(operation,metric,scope,entity)
);
CREATE INDEX engagement_adjustments_entity ON hash_talk.engagement_adjustments(scope,entity);

-- Revisions append new aggregate values; the original published value survives.
ALTER TABLE hash_talk.engagement_snapshots ADD COLUMN revision bigint NOT NULL DEFAULT 1;
ALTER TABLE hash_talk.engagement_snapshots ADD COLUMN generation bigint NOT NULL DEFAULT 0;
ALTER TABLE hash_talk.engagement_snapshots DROP CONSTRAINT engagement_snapshots_pkey;
ALTER TABLE hash_talk.engagement_snapshots ADD PRIMARY KEY(cutoff,period,metric,scope,entity,revision);

DO $$
DECLARE name text;
BEGIN
  FOREACH name IN ARRAY ARRAY['engagement_coverage','engagement_operations','engagement_adjustments'] LOOP
    EXECUTE format('CREATE TRIGGER content_usage_insert AFTER INSERT ON hash_talk.%I REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION hash_talk.track_statement_content_usage()',name);
    EXECUTE format('CREATE TRIGGER content_usage_delete AFTER DELETE ON hash_talk.%I REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION hash_talk.track_statement_content_usage()',name);
  END LOOP;
END;
$$;

-- Domain-owned read contract: only safe current gauges can be reconciled.
-- Creation/publication history cannot be reconstructed or rewritten this way.
CREATE FUNCTION hash_talk.engagement_current_gauges(target_scope text,target_id uuid)
RETURNS TABLE(metric text,value bigint) LANGUAGE sql STABLE AS $$
  SELECT 'accounts_existing',count(*) FROM hash_talk.accounts WHERE target_scope='project'
    HAVING target_scope='project'
  UNION ALL
  SELECT 'public_profiles_existing',count(*) FROM hash_talk.public_profiles WHERE target_scope='project'
    HAVING target_scope='project'
  UNION ALL
  SELECT wanted.metric,count(v.post_id)
    FROM (VALUES ('upvotes_current',1),('downvotes_current',-1)) wanted(metric,position)
    LEFT JOIN (hash_talk.community_votes v JOIN hash_talk.community_posts p ON p.id=v.post_id)
      ON v.position=wanted.position AND
        (target_scope='project' OR (target_scope='community' AND p.community_id=target_id) OR (target_scope='post' AND p.id=target_id))
    GROUP BY wanted.metric;
$$;
