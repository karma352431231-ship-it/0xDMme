-- Existing age is unknown. Only future INSERTs receive a creation timestamp.
ALTER TABLE hash_talk.communities ADD COLUMN created_at timestamptz(3);
ALTER TABLE hash_talk.communities ALTER COLUMN created_at SET DEFAULT clock_timestamp();
CREATE TABLE hash_talk.community_ranking_settings (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  observed_since timestamptz(3) NOT NULL DEFAULT clock_timestamp()
);
INSERT INTO hash_talk.community_ranking_settings(singleton) VALUES(true);
CREATE TABLE hash_talk.community_ranking_state (
  community_id uuid PRIMARY KEY REFERENCES hash_talk.communities(id) ON DELETE CASCADE,
  revision bigint NOT NULL DEFAULT 1,
  processed bigint NOT NULL DEFAULT 0,
  due_at timestamptz(3) NOT NULL DEFAULT clock_timestamp(),
  cutoff timestamptz(3),
  metrics jsonb,
  charge integer GENERATED ALWAYS AS (256+coalesce(octet_length(metrics::text),0)) STORED
) WITH (autovacuum_vacuum_scale_factor=0.05,autovacuum_vacuum_threshold=20,autovacuum_analyze_scale_factor=0.05,autovacuum_analyze_threshold=20);
CREATE INDEX community_ranking_due ON hash_talk.community_ranking_state(due_at,community_id);
CREATE TABLE hash_talk.community_upvote_deltas (
  post_id uuid NOT NULL REFERENCES hash_talk.community_posts(id) ON DELETE CASCADE,
  at timestamptz(3) NOT NULL,
  delta integer NOT NULL,
  charge integer NOT NULL DEFAULT 160 CHECK(charge=160),
  PRIMARY KEY(post_id,at)
) WITH (autovacuum_vacuum_scale_factor=0.05,autovacuum_vacuum_threshold=20,autovacuum_analyze_scale_factor=0.05,autovacuum_analyze_threshold=20);
CREATE INDEX community_upvote_expiry ON hash_talk.community_upvote_deltas(at,post_id);
CREATE TABLE hash_talk.community_ranking_generations (
  id uuid PRIMARY KEY,
  sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  cutoff timestamptz(3) NOT NULL,
  expires_at timestamptz(3) NOT NULL,
  version integer NOT NULL,
  published boolean NOT NULL DEFAULT false,
  charge integer NOT NULL DEFAULT 256
);
CREATE INDEX community_ranking_generation_expiry ON hash_talk.community_ranking_generations(expires_at,id);
CREATE TABLE hash_talk.community_ranking_entries (
  generation uuid NOT NULL REFERENCES hash_talk.community_ranking_generations(id) ON DELETE CASCADE,
  community_id uuid NOT NULL REFERENCES hash_talk.communities(id) ON DELETE CASCADE,
  period text NOT NULL CHECK(period IN ('day','week')),
  score bigint NOT NULL,
  participants integer NOT NULL,
  contributions integer NOT NULL,
  upvotes integer NOT NULL,
  history_complete boolean NOT NULL,
  followers integer NOT NULL,
  trending boolean NOT NULL,
  newly_created boolean NOT NULL,
  charge integer NOT NULL DEFAULT 256,
  PRIMARY KEY(generation,period,community_id)
) WITH (autovacuum_vacuum_scale_factor=0.05,autovacuum_vacuum_threshold=20,autovacuum_analyze_scale_factor=0.05,autovacuum_analyze_threshold=20);
CREATE INDEX community_ranking_trending ON hash_talk.community_ranking_entries(generation,period,score DESC,community_id DESC) WHERE trending;
CREATE INDEX community_ranking_new ON hash_talk.community_ranking_entries(generation,period,score DESC,community_id DESC) WHERE newly_created;
CREATE INDEX community_ranking_size ON hash_talk.community_ranking_entries(generation,period,followers DESC,community_id DESC);

CREATE FUNCTION hash_talk.mark_community_ranking() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE affected uuid;
BEGIN
  IF TG_TABLE_NAME='communities' THEN
    IF TG_OP='DELETE' THEN RETURN OLD; END IF;
    affected:=NEW.id;
  ELSE
    IF TG_OP='DELETE' THEN affected:=OLD.community_id; ELSE affected:=NEW.community_id; END IF;
  END IF;
  INSERT INTO hash_talk.community_ranking_state(community_id)
    SELECT id FROM hash_talk.communities WHERE id=affected
    ON CONFLICT(community_id) DO UPDATE SET revision=hash_talk.community_ranking_state.revision+1;
  PERFORM pg_notify('hash_talk_ranking','');
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER community_ranking_changed AFTER INSERT OR UPDATE ON hash_talk.communities FOR EACH ROW EXECUTE FUNCTION hash_talk.mark_community_ranking();
CREATE TRIGGER community_ranking_post_changed AFTER INSERT OR DELETE OR UPDATE ON hash_talk.community_posts FOR EACH ROW EXECUTE FUNCTION hash_talk.mark_community_ranking();
CREATE TRIGGER community_ranking_follow_changed AFTER INSERT OR DELETE ON hash_talk.community_follows FOR EACH ROW EXECUTE FUNCTION hash_talk.mark_community_ranking();
INSERT INTO hash_talk.community_ranking_state(community_id) SELECT id FROM hash_talk.communities;

CREATE FUNCTION hash_talk.track_community_upvote_delta() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE positive_delta integer:=0; target uuid; event_at timestamptz(3):=clock_timestamp();
BEGIN
  IF TG_OP<>'INSERT' THEN
    positive_delta:=positive_delta-CASE WHEN OLD.position=1 THEN 1 ELSE 0 END;
    target:=OLD.post_id;
  END IF;
  IF TG_OP<>'DELETE' THEN
    positive_delta:=positive_delta+CASE WHEN NEW.position=1 THEN 1 ELSE 0 END;
    target:=NEW.post_id;
  END IF;
  IF positive_delta<>0 AND EXISTS(SELECT 1 FROM hash_talk.community_posts WHERE id=target AND parent_id IS NULL) THEN
    INSERT INTO hash_talk.community_upvote_deltas(post_id,at,delta) VALUES(target,event_at,positive_delta)
      ON CONFLICT(post_id,at) DO UPDATE SET delta=hash_talk.community_upvote_deltas.delta+EXCLUDED.delta;
    DELETE FROM hash_talk.community_upvote_deltas WHERE post_id=target AND at=event_at AND delta=0;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER community_vote_positive_delta AFTER INSERT OR DELETE OR UPDATE ON hash_talk.community_votes FOR EACH ROW EXECUTE FUNCTION hash_talk.track_community_upvote_delta();
CREATE TRIGGER ranking_state_usage AFTER INSERT OR DELETE OR UPDATE ON hash_talk.community_ranking_state FOR EACH ROW EXECUTE FUNCTION hash_talk.track_message_usage();
CREATE TRIGGER ranking_delta_usage AFTER INSERT OR DELETE OR UPDATE ON hash_talk.community_upvote_deltas FOR EACH ROW EXECUTE FUNCTION hash_talk.track_message_usage();
CREATE TRIGGER ranking_generation_usage AFTER INSERT OR DELETE ON hash_talk.community_ranking_generations FOR EACH ROW EXECUTE FUNCTION hash_talk.track_message_usage();
CREATE TRIGGER ranking_entry_usage AFTER INSERT OR DELETE ON hash_talk.community_ranking_entries FOR EACH ROW EXECUTE FUNCTION hash_talk.track_message_usage();
-- Initial state was inserted before its accounting trigger was created.
UPDATE hash_talk.content_usage SET used_bytes=used_bytes+(SELECT coalesce(sum(charge),0) FROM hash_talk.community_ranking_state) WHERE singleton;

-- Hints have no private payload and are delivered only after COMMIT.
CREATE FUNCTION hash_talk.wake_pending_push() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.pending AND (TG_OP='INSERT' OR NEW.generation IS DISTINCT FROM OLD.generation) THEN
    PERFORM pg_notify('hash_talk_push','');
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER push_work_available AFTER INSERT OR UPDATE ON hash_talk.push_subscriptions FOR EACH ROW EXECUTE FUNCTION hash_talk.wake_pending_push();
