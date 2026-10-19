-- In-window receipt signals; no earlier-window growth comparison or backfill.
ALTER TABLE hash_talk.community_ranking_settings ADD COLUMN engagement_observed_since timestamptz(3) NOT NULL DEFAULT clock_timestamp();
ALTER TABLE hash_talk.community_ranking_entries DROP CONSTRAINT community_ranking_entries_period_check;
ALTER TABLE hash_talk.community_ranking_entries ADD CHECK(period IN ('day','week','month'));
ALTER TABLE hash_talk.community_ranking_entries ADD COLUMN views bigint NOT NULL DEFAULT 0,
  ADD COLUMN shares bigint NOT NULL DEFAULT 0, ADD COLUMN comments integer NOT NULL DEFAULT 0;

CREATE TABLE hash_talk.community_post_engagement (
  post_id uuid NOT NULL REFERENCES hash_talk.community_posts(id) ON DELETE CASCADE,
  at timestamptz(3) NOT NULL,
  views integer NOT NULL DEFAULT 0 CHECK(views>=0),
  shares integer NOT NULL DEFAULT 0 CHECK(shares>=0),
  charge integer NOT NULL DEFAULT 160 CHECK(charge=160),
  PRIMARY KEY(post_id,at)
) WITH (autovacuum_vacuum_scale_factor=0.05,autovacuum_vacuum_threshold=20);
CREATE INDEX community_engagement_expiry ON hash_talk.community_post_engagement(at,post_id);
CREATE TABLE hash_talk.community_share_clicks (
  post_id uuid NOT NULL REFERENCES hash_talk.community_posts(id) ON DELETE CASCADE,
  token_hash text NOT NULL CHECK(token_hash ~ '^[a-f0-9]{64}$'),
  at timestamptz(3) NOT NULL DEFAULT clock_timestamp(),
  charge integer NOT NULL DEFAULT 128 CHECK(charge=128),
  PRIMARY KEY(post_id,token_hash)
) WITH (autovacuum_vacuum_scale_factor=0.05,autovacuum_vacuum_threshold=20);
CREATE INDEX community_share_click_expiry ON hash_talk.community_share_clicks(at,post_id);
CREATE TABLE hash_talk.profile_ranking_state (
  profile_id uuid PRIMARY KEY REFERENCES hash_talk.public_profiles(id) ON DELETE CASCADE,
  revision bigint NOT NULL DEFAULT 1, processed bigint NOT NULL DEFAULT 0,
  due_at timestamptz(3) NOT NULL DEFAULT clock_timestamp(), cutoff timestamptz(3), metrics jsonb,
  charge integer GENERATED ALWAYS AS (256+coalesce(octet_length(metrics::text),0)) STORED
) WITH (autovacuum_vacuum_scale_factor=0.05,autovacuum_vacuum_threshold=20);
CREATE INDEX profile_ranking_due ON hash_talk.profile_ranking_state(due_at,profile_id);
CREATE TABLE hash_talk.profile_ranking_entries (
  generation uuid NOT NULL REFERENCES hash_talk.community_ranking_generations(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES hash_talk.public_profiles(id) ON DELETE CASCADE,
  period text NOT NULL CHECK(period IN ('day','week','month')),
  score bigint NOT NULL CHECK(score>=0), metrics jsonb NOT NULL,
  charge integer GENERATED ALWAYS AS (256+octet_length(metrics::text)) STORED,
  PRIMARY KEY(generation,period,profile_id)
) WITH (autovacuum_vacuum_scale_factor=0.05,autovacuum_vacuum_threshold=20);
CREATE INDEX profile_ranking_order ON hash_talk.profile_ranking_entries(generation,period,score DESC,profile_id DESC) WHERE score>0;

CREATE FUNCTION hash_talk.mark_profile_ranking() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE who uuid;
BEGIN
  IF TG_OP='DELETE' THEN who:=OLD.author; ELSE who:=NEW.author; END IF;
  -- Publishing without receipt signals must not create work for every account.
  UPDATE hash_talk.profile_ranking_state SET revision=revision+1 WHERE profile_id=who;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER profile_ranking_post_changed AFTER DELETE OR UPDATE OF author,deleted,active_removal,discussion_blocked,media_ids
  ON hash_talk.community_posts FOR EACH ROW EXECUTE FUNCTION hash_talk.mark_profile_ranking();
CREATE FUNCTION hash_talk.touch_receiving_rankings(target uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE post hash_talk.community_posts;
BEGIN
  SELECT * INTO post FROM hash_talk.community_posts WHERE id=target;
  IF NOT FOUND THEN RETURN; END IF;
  INSERT INTO hash_talk.community_ranking_state(community_id) VALUES(post.community_id)
    ON CONFLICT(community_id) DO UPDATE SET revision=hash_talk.community_ranking_state.revision+1;
  IF post.author IS NOT NULL AND post.parent_id IS NULL THEN
    INSERT INTO hash_talk.profile_ranking_state(profile_id) VALUES(post.author)
      ON CONFLICT(profile_id) DO UPDATE SET revision=hash_talk.profile_ranking_state.revision+1;
  END IF;
  PERFORM pg_notify('hash_talk_ranking','');
END;
$$;
CREATE FUNCTION hash_talk.mark_received_engagement() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN PERFORM hash_talk.touch_receiving_rankings(OLD.post_id); RETURN OLD; END IF;
  PERFORM hash_talk.touch_receiving_rankings(NEW.post_id); RETURN NEW;
END;
$$;
CREATE FUNCTION hash_talk.mark_engagement_batch() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM new_rows) THEN RETURN NULL; END IF;
  INSERT INTO hash_talk.community_ranking_state(community_id)
    SELECT DISTINCT p.community_id FROM new_rows e JOIN hash_talk.community_posts p ON p.id=e.post_id
    ON CONFLICT(community_id) DO UPDATE SET revision=hash_talk.community_ranking_state.revision+1;
  INSERT INTO hash_talk.profile_ranking_state(profile_id)
    SELECT DISTINCT p.author FROM new_rows e JOIN hash_talk.community_posts p ON p.id=e.post_id
    WHERE p.author IS NOT NULL AND p.parent_id IS NULL
    ON CONFLICT(profile_id) DO UPDATE SET revision=hash_talk.profile_ranking_state.revision+1;
  PERFORM pg_notify('hash_talk_ranking','');
  RETURN NULL;
END;
$$;
CREATE TRIGGER engagement_ranking_insert AFTER INSERT ON hash_talk.community_post_engagement
  REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION hash_talk.mark_engagement_batch();
CREATE TRIGGER engagement_ranking_update AFTER UPDATE ON hash_talk.community_post_engagement
  REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION hash_talk.mark_engagement_batch();
CREATE TRIGGER positive_ranking_changed AFTER INSERT OR UPDATE OR DELETE ON hash_talk.community_upvote_deltas
  FOR EACH ROW EXECUTE FUNCTION hash_talk.mark_received_engagement();
CREATE FUNCTION hash_talk.record_public_engagement() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- Coalesce admitted marks by post/second; do not create an event row per view.
  INSERT INTO hash_talk.community_post_engagement(post_id,at,views,shares)
    SELECT post_id,date_trunc('second',clock_timestamp()),
      CASE WHEN TG_TABLE_NAME='community_post_view_marks' THEN count(*)::integer ELSE 0 END,
      CASE WHEN TG_TABLE_NAME='community_share_clicks' THEN count(*)::integer ELSE 0 END
    FROM new_rows GROUP BY post_id
    ON CONFLICT(post_id,at) DO UPDATE SET views=hash_talk.community_post_engagement.views+EXCLUDED.views,
      shares=hash_talk.community_post_engagement.shares+EXCLUDED.shares;
  RETURN NULL;
END;
$$;
CREATE TRIGGER view_received AFTER INSERT ON hash_talk.community_post_view_marks
  REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION hash_talk.record_public_engagement();
CREATE TRIGGER share_received AFTER INSERT ON hash_talk.community_share_clicks
  REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION hash_talk.record_public_engagement();
CREATE FUNCTION hash_talk.mark_received_comment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    IF OLD.root_id IS NOT NULL THEN PERFORM hash_talk.touch_receiving_rankings(OLD.root_id); END IF;
    RETURN OLD;
  END IF;
  IF NEW.root_id IS NOT NULL THEN PERFORM hash_talk.touch_receiving_rankings(NEW.root_id); END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER comment_received AFTER INSERT OR DELETE OR UPDATE OF deleted,active_removal,discussion_blocked,media_ids,author,created_at
  ON hash_talk.community_posts FOR EACH ROW EXECUTE FUNCTION hash_talk.mark_received_comment();

-- New charged tables use statement accounting, preserving global-before-cache order.
DO $$
DECLARE name text;
BEGIN
  FOREACH name IN ARRAY ARRAY['community_post_engagement','community_share_clicks','profile_ranking_state'] LOOP
    EXECUTE format('CREATE TRIGGER content_usage_insert AFTER INSERT ON hash_talk.%I REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION hash_talk.track_statement_content_usage()',name);
    EXECUTE format('CREATE TRIGGER content_usage_update AFTER UPDATE ON hash_talk.%I REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION hash_talk.track_statement_content_usage()',name);
    EXECUTE format('CREATE TRIGGER content_usage_delete AFTER DELETE ON hash_talk.%I REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION hash_talk.track_statement_content_usage()',name);
  END LOOP;
END;
$$;
CREATE TRIGGER profile_entries_insert_usage AFTER INSERT ON hash_talk.profile_ranking_entries
  REFERENCING NEW TABLE AS inserted FOR EACH STATEMENT EXECUTE FUNCTION hash_talk.track_ranking_entries_insert();
CREATE TRIGGER profile_entries_delete_usage AFTER DELETE ON hash_talk.profile_ranking_entries
  REFERENCING OLD TABLE AS removed FOR EACH STATEMENT EXECUTE FUNCTION hash_talk.track_ranking_entries_delete();
-- Seed only authors with a potentially live receipt signal, never all registered accounts.
INSERT INTO hash_talk.profile_ranking_state(profile_id)
SELECT DISTINCT p.author FROM hash_talk.community_posts p WHERE p.author IS NOT NULL AND p.parent_id IS NULL AND (
 EXISTS(SELECT 1 FROM hash_talk.community_posts r WHERE r.root_id=p.id AND r.created_at>=clock_timestamp()-interval '30 days')
 OR EXISTS(SELECT 1 FROM hash_talk.community_upvote_deltas d WHERE d.post_id=p.id AND d.at>=clock_timestamp()-interval '30 days'));
CREATE INDEX ranking_root_recent_comments ON hash_talk.community_posts(root_id,created_at) WHERE root_id IS NOT NULL;
CREATE INDEX ranking_author_originals ON hash_talk.community_posts(author,id) WHERE parent_id IS NULL AND author IS NOT NULL;
