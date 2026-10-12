-- Public-only, incremental subtree engagement. No content copies or reader history.
-- Per-participant rows are charged to the existing global capacity ledger.
ALTER TABLE hash_talk.community_posts
  ADD COLUMN discussion_blocked boolean NOT NULL DEFAULT false,
  ADD COLUMN discussion_participants integer NOT NULL DEFAULT 0 CHECK(discussion_participants>=0),
  ADD COLUMN discussion_activity bigint NOT NULL DEFAULT 0 CHECK(discussion_activity>=0);
CREATE TABLE hash_talk.community_discussion_participants (
  post_id uuid NOT NULL REFERENCES hash_talk.community_posts(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES hash_talk.public_profiles(id) ON DELETE CASCADE,
  contributions integer NOT NULL CHECK(contributions>0),
  charge integer NOT NULL DEFAULT 256 CHECK(charge=256),
  PRIMARY KEY(post_id,profile_id)
) WITH (autovacuum_vacuum_scale_factor=0.05,autovacuum_vacuum_threshold=20,
  autovacuum_analyze_scale_factor=0.05,autovacuum_analyze_threshold=20);
CREATE TRIGGER discussion_participant_usage AFTER INSERT OR DELETE OR UPDATE
ON hash_talk.community_discussion_participants FOR EACH ROW EXECUTE FUNCTION hash_talk.track_message_usage();

CREATE FUNCTION hash_talk.discussion_media_blocked(ids uuid[]) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS(SELECT 1 FROM hash_talk.public_moderation pm
    WHERE pm.kind='post-media' AND pm.target=ANY(ids)
      AND pm.status IN ('rejected','held','failed','discarding','expired')
      AND NOT EXISTS(SELECT 1 FROM hash_talk.public_moderation newer
        WHERE newer.kind=pm.kind AND newer.target=pm.target AND newer.status='approved'
          AND (newer.created_at,newer.id)>(pm.created_at,pm.id)));
$$;
UPDATE hash_talk.community_posts SET discussion_blocked=hash_talk.discussion_media_blocked(media_ids)
WHERE hash_talk.discussion_media_blocked(media_ids);
CREATE FUNCTION hash_talk.prepare_discussion_visibility() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.discussion_blocked:=hash_talk.discussion_media_blocked(NEW.media_ids);
  RETURN NEW;
END;
$$;
CREATE TRIGGER discussion_post_visibility BEFORE INSERT OR UPDATE OF media_ids
ON hash_talk.community_posts FOR EACH ROW EXECUTE FUNCTION hash_talk.prepare_discussion_visibility();
CREATE INDEX community_discussion_media_refs ON hash_talk.community_posts USING gin(media_ids) WHERE cardinality(media_ids)>0;
CREATE FUNCTION hash_talk.refresh_discussion_visibility() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE targets uuid[] := '{}';
BEGIN
  IF TG_OP<>'INSERT' AND OLD.kind='post-media' THEN targets:=array_append(targets,OLD.target); END IF;
  IF TG_OP<>'DELETE' AND NEW.kind='post-media' THEN targets:=array_append(targets,NEW.target); END IF;
  UPDATE hash_talk.community_posts SET discussion_blocked=hash_talk.discussion_media_blocked(media_ids)
  WHERE cardinality(media_ids)>0 AND media_ids && targets AND discussion_blocked IS DISTINCT FROM hash_talk.discussion_media_blocked(media_ids);
  RETURN NULL;
END;
$$;
CREATE TRIGGER discussion_moderation_visibility AFTER INSERT OR DELETE OR UPDATE OF status
ON hash_talk.public_moderation FOR EACH ROW EXECUTE FUNCTION hash_talk.refresh_discussion_visibility();

CREATE FUNCTION hash_talk.track_discussion_participant() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  target uuid;
  participant uuid;
  before_count integer := 0;
  after_count integer := 0;
BEGIN
  IF TG_OP<>'INSERT' THEN
    target:=OLD.post_id; participant:=OLD.profile_id; before_count:=OLD.contributions;
  END IF;
  IF TG_OP<>'DELETE' THEN
    target:=NEW.post_id; participant:=NEW.profile_id; after_count:=NEW.contributions;
  END IF;
  -- First contribution = five points; second = one more; further repeats = zero.
  IF least(before_count,2)<>least(after_count,2) THEN
    UPDATE hash_talk.community_posts SET
      discussion_participants=discussion_participants+(CASE WHEN after_count>0 THEN 1 ELSE 0 END)-(CASE WHEN before_count>0 THEN 1 ELSE 0 END),
      discussion_activity=discussion_activity+(CASE WHEN after_count>0 THEN 4+least(after_count,2) ELSE 0 END)-(CASE WHEN before_count>0 THEN 4+least(before_count,2) ELSE 0 END)
    WHERE id=target AND author IS DISTINCT FROM participant;
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER discussion_participant_metrics AFTER INSERT OR DELETE OR UPDATE
ON hash_talk.community_discussion_participants FOR EACH ROW EXECUTE FUNCTION hash_talk.track_discussion_participant();

CREATE FUNCTION hash_talk.adjust_discussion_contribution(parent uuid, participant uuid, delta integer)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE ancestor uuid; current_count integer;
BEGIN
  -- Parent/root links are immutable and refer to pre-existing posts, so the path is acyclic.
  -- Only one ancestor path is visited at write time; reads never walk subtrees.
  FOR ancestor IN
    WITH RECURSIVE path AS (
      SELECT id,parent_id FROM hash_talk.community_posts WHERE id=parent
      UNION ALL SELECT p.id,p.parent_id FROM hash_talk.community_posts p JOIN path a ON p.id=a.parent_id
    ) SELECT id FROM path
  LOOP
    IF delta=1 THEN
      INSERT INTO hash_talk.community_discussion_participants(post_id,profile_id,contributions)
      VALUES(ancestor,participant,1) ON CONFLICT(post_id,profile_id)
      DO UPDATE SET contributions=hash_talk.community_discussion_participants.contributions+1;
    ELSE
      SELECT contributions INTO current_count FROM hash_talk.community_discussion_participants
      WHERE post_id=ancestor AND profile_id=participant FOR UPDATE;
      IF current_count>1 THEN
        UPDATE hash_talk.community_discussion_participants SET contributions=contributions-1
        WHERE post_id=ancestor AND profile_id=participant;
      ELSE
        DELETE FROM hash_talk.community_discussion_participants WHERE post_id=ancestor AND profile_id=participant;
      END IF;
    END IF;
  END LOOP;
END;
$$;
CREATE FUNCTION hash_talk.track_discussion_post() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='UPDATE' AND OLD.author IS NOT DISTINCT FROM NEW.author
    AND OLD.deleted=NEW.deleted AND OLD.active_removal IS NOT DISTINCT FROM NEW.active_removal AND OLD.discussion_blocked=NEW.discussion_blocked THEN RETURN NEW; END IF;
  IF TG_OP<>'INSERT' AND OLD.parent_id IS NOT NULL AND OLD.author IS NOT NULL
    AND NOT OLD.deleted AND OLD.active_removal IS NULL AND NOT OLD.discussion_blocked THEN
    PERFORM hash_talk.adjust_discussion_contribution(OLD.parent_id,OLD.author,-1);
  END IF;
  IF TG_OP<>'DELETE' AND NEW.parent_id IS NOT NULL AND NEW.author IS NOT NULL
    AND NOT NEW.deleted AND NEW.active_removal IS NULL AND NOT NEW.discussion_blocked THEN
    PERFORM hash_talk.adjust_discussion_contribution(NEW.parent_id,NEW.author,1);
  END IF;
  IF TG_OP='UPDATE' AND OLD.author IS DISTINCT FROM NEW.author THEN
    UPDATE hash_talk.community_posts SET
      discussion_participants=(SELECT count(*) FROM hash_talk.community_discussion_participants WHERE post_id=NEW.id AND profile_id IS DISTINCT FROM NEW.author),
      discussion_activity=(SELECT coalesce(sum(4+least(contributions,2)),0) FROM hash_talk.community_discussion_participants WHERE post_id=NEW.id AND profile_id IS DISTINCT FROM NEW.author)
    WHERE id=NEW.id;
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER discussion_post_metrics AFTER INSERT OR DELETE OR UPDATE OF author,deleted,active_removal,discussion_blocked,media_ids
ON hash_talk.community_posts FOR EACH ROW EXECUTE FUNCTION hash_talk.track_discussion_post();

-- One-time migration backfill includes descendants behind retained deletion markers,
-- but only currently visible, attributed replies contribute themselves.
WITH RECURSIVE ancestors AS (
  SELECT parent_id AS post_id,author AS profile_id FROM hash_talk.community_posts
  WHERE parent_id IS NOT NULL AND author IS NOT NULL AND NOT deleted AND active_removal IS NULL AND NOT discussion_blocked
  UNION ALL
  SELECT p.parent_id,a.profile_id FROM ancestors a JOIN hash_talk.community_posts p ON p.id=a.post_id WHERE p.parent_id IS NOT NULL
)
INSERT INTO hash_talk.community_discussion_participants(post_id,profile_id,contributions)
SELECT post_id,profile_id,count(*) FROM ancestors GROUP BY post_id,profile_id;
CREATE INDEX community_reply_first ON hash_talk.community_posts(root_id,created_at,id)
WHERE parent_id IS NOT NULL AND NOT deleted AND active_removal IS NULL;
CREATE INDEX community_reply_discussed ON hash_talk.community_posts(community_id,parent_id,(CASE WHEN deleted OR active_removal IS NOT NULL THEN 0 ELSE discussion_activity END) DESC,(CASE WHEN deleted OR active_removal IS NOT NULL THEN 0 ELSE score END) DESC,created_at DESC,id DESC);
CREATE INDEX community_reply_votes ON hash_talk.community_posts(community_id,parent_id,(CASE WHEN deleted OR active_removal IS NOT NULL THEN 0 ELSE score END) DESC,created_at DESC,id DESC);

-- Future automatic eligibility changes must wake the existing ranking producer.
-- Install after backfill so historical ranking records remain byte-identical.
CREATE TRIGGER community_ranking_discussion_visibility AFTER UPDATE OF discussion_blocked
ON hash_talk.community_posts FOR EACH ROW WHEN (OLD.discussion_blocked IS DISTINCT FROM NEW.discussion_blocked)
EXECUTE FUNCTION hash_talk.mark_community_ranking();
