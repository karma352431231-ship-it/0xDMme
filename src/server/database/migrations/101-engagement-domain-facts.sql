-- Domain adapters own the mapping from committed row transitions to narrow
-- metric facts. Trigger failure aborts the original transaction as well.
-- Canonical public visibility is shared by domain reads and fact adapters.
CREATE FUNCTION hash_talk.public_post_media_blocked(media_ids uuid[]) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS(SELECT 1 FROM hash_talk.public_moderation pm
    WHERE pm.kind='post-media' AND pm.target=ANY(media_ids)
      AND pm.status IN ('rejected','held','failed','discarding','expired')
      AND NOT EXISTS(SELECT 1 FROM hash_talk.public_moderation newer
        WHERE newer.kind=pm.kind AND newer.target=pm.target AND newer.status='approved'
          AND (newer.created_at,newer.id)>(pm.created_at,pm.id)));
$$;
CREATE FUNCTION hash_talk.public_post_is_visible(deleted boolean,removal uuid,media_ids uuid[])
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT NOT deleted AND removal IS NULL AND NOT hash_talk.public_post_media_blocked(media_ids);
$$;

CREATE FUNCTION hash_talk.refresh_engagement_post(target uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE item record; prefix text;
BEGIN
  SELECT p.id,p.community_id,p.parent_id,p.root_id,p.author,p.deleted,
    hash_talk.public_post_is_visible(p.deleted,p.active_removal,p.media_ids) AS eligible
    INTO item FROM hash_talk.community_posts p WHERE p.id=target;
  IF NOT FOUND THEN RETURN; END IF;
  INSERT INTO hash_talk.engagement_entities(id,kind,community,root,parent,eligible,erased)
    VALUES(item.id,CASE WHEN item.parent_id IS NULL THEN 'post' ELSE 'reply' END,
      item.community_id,item.root_id,item.parent_id,item.eligible,item.deleted)
    ON CONFLICT(scope,id) DO UPDATE SET eligible=excluded.eligible,erased=excluded.erased;
  IF NOT item.eligible THEN RETURN; END IF;
  IF item.root_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM hash_talk.community_posts r
    WHERE r.id=item.root_id AND hash_talk.public_post_is_visible(r.deleted,r.active_removal,r.media_ids)) THEN RETURN; END IF;
  UPDATE hash_talk.engagement_entities SET publication_seen=true
    WHERE scope='post' AND id=item.id AND NOT publication_seen;
  IF NOT FOUND THEN RETURN; END IF;
  prefix:=CASE WHEN item.parent_id IS NULL THEN 'posts' ELSE 'replies' END;
  PERFORM hash_talk.record_engagement(prefix||'_published',item.community_id,item.id);
  IF item.author IS NOT NULL THEN
    INSERT INTO hash_talk.engagement_contributors(post,community,author,published_at)
      VALUES(item.id,item.community_id,item.author,clock_timestamp());
  END IF;
END;
$$;
CREATE FUNCTION hash_talk.engagement_account_fact() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    PERFORM hash_talk.record_engagement(TG_ARGV[0]||'_created',NULL,NULL);
    PERFORM hash_talk.record_engagement(TG_ARGV[0]||'_existing',NULL,NULL);
    RETURN NEW;
  END IF;
  PERFORM hash_talk.record_engagement(TG_ARGV[0]||'_existing',NULL,NULL,-1);
  RETURN OLD;
END;
$$;
CREATE TRIGGER engagement_account_fact AFTER INSERT OR DELETE ON hash_talk.accounts
  FOR EACH ROW EXECUTE FUNCTION hash_talk.engagement_account_fact('accounts');
CREATE TRIGGER engagement_profile_fact AFTER INSERT OR DELETE ON hash_talk.public_profiles
  FOR EACH ROW EXECUTE FUNCTION hash_talk.engagement_account_fact('public_profiles');

CREATE FUNCTION hash_talk.engagement_community_fact() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    UPDATE hash_talk.engagement_state SET community_erased_at=clock_timestamp() WHERE singleton;
    UPDATE hash_talk.engagement_entities SET erased=true,eligible=false WHERE scope='community' AND id=OLD.id;
    INSERT INTO hash_talk.engagement_erasure(scope,id) VALUES('community',OLD.id) ON CONFLICT DO NOTHING;
    RETURN OLD;
  END IF;
  INSERT INTO hash_talk.engagement_entities(id,kind,community,eligible)
    VALUES(NEW.id,'community',NEW.id,NOT NEW.archived)
    ON CONFLICT(scope,id) DO UPDATE SET eligible=excluded.eligible;
  RETURN NEW;
END;
$$;
CREATE TRIGGER engagement_community_fact AFTER INSERT OR DELETE OR UPDATE OF archived ON hash_talk.communities
  FOR EACH ROW EXECUTE FUNCTION hash_talk.engagement_community_fact();

CREATE FUNCTION hash_talk.engagement_post_fact() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE prefix text;
BEGIN
  IF TG_OP='DELETE' THEN
    UPDATE hash_talk.engagement_state SET author_erased_at=clock_timestamp() WHERE singleton;
    UPDATE hash_talk.engagement_entities SET erased=true,eligible=false WHERE scope='post' AND id=OLD.id;
    DELETE FROM hash_talk.engagement_contributors WHERE post=OLD.id;
    INSERT INTO hash_talk.engagement_erasure(scope,id) VALUES('post',OLD.id) ON CONFLICT DO NOTHING;
    RETURN OLD;
  END IF;
  IF NEW.deleted THEN
    UPDATE hash_talk.engagement_state SET author_erased_at=clock_timestamp() WHERE singleton;
    DELETE FROM hash_talk.engagement_contributors WHERE post=NEW.id;
    INSERT INTO hash_talk.engagement_erasure(scope,id) VALUES('post',NEW.id) ON CONFLICT DO NOTHING;
  END IF;
  IF TG_OP='INSERT' THEN
    prefix := CASE WHEN NEW.parent_id IS NULL THEN 'posts' ELSE 'replies' END;
    PERFORM hash_talk.record_engagement(prefix||'_created',NEW.community_id,NEW.id);
  END IF;
  PERFORM hash_talk.refresh_engagement_post(NEW.id);
  RETURN NEW;
END;
$$;
CREATE TRIGGER engagement_post_fact AFTER INSERT OR DELETE OR UPDATE OF deleted,active_removal,media_ids ON hash_talk.community_posts
  FOR EACH ROW EXECUTE FUNCTION hash_talk.engagement_post_fact();
CREATE FUNCTION hash_talk.engagement_media_visibility() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target uuid; post uuid;
BEGIN
  IF TG_OP='DELETE' THEN target:=OLD.target;
  ELSE target:=NEW.target; END IF;
  SELECT post_id INTO post FROM hash_talk.community_media WHERE id=target;
  IF post IS NOT NULL THEN PERFORM hash_talk.refresh_engagement_post(post); END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER engagement_media_visibility AFTER INSERT OR DELETE OR UPDATE OF status ON hash_talk.public_moderation
  FOR EACH ROW EXECUTE FUNCTION hash_talk.engagement_media_visibility();
CREATE FUNCTION hash_talk.engagement_media_attachment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.post_id IS NOT NULL THEN PERFORM hash_talk.refresh_engagement_post(OLD.post_id); END IF;
  IF NEW.post_id IS NOT NULL AND NEW.post_id IS DISTINCT FROM OLD.post_id THEN
    PERFORM hash_talk.refresh_engagement_post(NEW.post_id);
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER engagement_media_attachment AFTER UPDATE OF post_id ON hash_talk.community_media
  FOR EACH ROW EXECUTE FUNCTION hash_talk.engagement_media_attachment();
CREATE FUNCTION hash_talk.engagement_author_erasure() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE hash_talk.engagement_state SET author_erased_at=clock_timestamp() WHERE singleton;
  RETURN OLD;
END;
$$;
CREATE TRIGGER engagement_author_erasure BEFORE DELETE ON hash_talk.public_profiles
  FOR EACH ROW EXECUTE FUNCTION hash_talk.engagement_author_erasure();

CREATE FUNCTION hash_talk.engagement_view_fact() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE item record;
BEGIN
  SELECT id,community_id,parent_id INTO STRICT item FROM hash_talk.community_posts WHERE id=NEW.post_id;
  PERFORM hash_talk.record_engagement(CASE WHEN TG_TABLE_NAME='community_share_clicks' THEN 'share_actions_started'
    WHEN item.parent_id IS NULL THEN 'post_views_estimated'
    ELSE 'reply_views_estimated' END,item.community_id,item.id);
  RETURN NEW;
END;
$$;
CREATE TRIGGER engagement_view_fact AFTER INSERT ON hash_talk.community_post_view_marks
  FOR EACH ROW EXECUTE FUNCTION hash_talk.engagement_view_fact();
CREATE TRIGGER engagement_share_fact AFTER INSERT ON hash_talk.community_share_clicks
  FOR EACH ROW EXECUTE FUNCTION hash_talk.engagement_view_fact();

CREATE FUNCTION hash_talk.engagement_vote_fact() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  previous integer := 0;
  desired integer := 0;
  target uuid;
  community_id uuid;
  cause text := 'user';
BEGIN
  IF TG_OP<>'INSERT' THEN previous := OLD.position; target := OLD.post_id; END IF;
  IF TG_OP<>'DELETE' THEN desired := NEW.position; target := NEW.post_id; END IF;
  IF previous=desired THEN RETURN NULL; END IF;
  IF TG_OP='DELETE' THEN cause := 'cleanup'; END IF;
  -- The post can already be gone during FK cascading; its metric projection
  -- deliberately remains until bounded erasure has consumed the counters.
  SELECT coalesce(
    (SELECT p.community_id FROM hash_talk.community_posts p WHERE p.id=target),
    (SELECT community FROM hash_talk.engagement_entities WHERE scope='post' AND id=target)
  ) INTO community_id;
  IF previous<>0 THEN
    PERFORM hash_talk.record_engagement(CASE WHEN previous=1 THEN 'upvotes_removed' ELSE 'downvotes_removed' END,community_id,target,1,cause);
    PERFORM hash_talk.record_engagement(CASE WHEN previous=1 THEN 'upvotes_current' ELSE 'downvotes_current' END,community_id,target,-1);
  END IF;
  IF desired<>0 THEN
    PERFORM hash_talk.record_engagement(CASE WHEN desired=1 THEN 'upvotes_added' ELSE 'downvotes_added' END,community_id,target);
    PERFORM hash_talk.record_engagement(CASE WHEN desired=1 THEN 'upvotes_current' ELSE 'downvotes_current' END,community_id,target);
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER engagement_vote_fact AFTER INSERT OR DELETE OR UPDATE OF position ON hash_talk.community_votes
  FOR EACH ROW EXECUTE FUNCTION hash_talk.engagement_vote_fact();
CREATE TRIGGER engagement_erasure_work AFTER INSERT ON hash_talk.engagement_erasure
  FOR EACH ROW EXECUTE FUNCTION hash_talk.wake_maintenance('engagement');

-- Proven current inventory is a baseline, never a historical creation backfill.
SELECT hash_talk.record_engagement('accounts_existing',NULL,NULL,count(*)) FROM hash_talk.accounts;
SELECT hash_talk.record_engagement('public_profiles_existing',NULL,NULL,count(*)) FROM hash_talk.public_profiles;
INSERT INTO hash_talk.engagement_entities(id,kind,community,eligible)
  SELECT id,'community',id,NOT archived FROM hash_talk.communities;
INSERT INTO hash_talk.engagement_entities(id,kind,community,root,parent,eligible,erased,publication_seen)
  SELECT id,CASE WHEN parent_id IS NULL THEN 'post' ELSE 'reply' END,community_id,root_id,parent_id,
    hash_talk.public_post_is_visible(deleted,active_removal,media_ids),deleted,true FROM hash_talk.community_posts;
INSERT INTO hash_talk.engagement_erasure(scope,id) SELECT scope,id FROM hash_talk.engagement_entities WHERE erased;
-- These are current positions; no historical additions/removals are invented.
SELECT hash_talk.record_engagement(CASE WHEN v.position=1 THEN 'upvotes_current' ELSE 'downvotes_current' END,
  p.community_id,v.post_id,count(*)) FROM hash_talk.community_votes v
  JOIN hash_talk.community_posts p ON p.id=v.post_id WHERE v.position<>0 GROUP BY v.position,p.community_id,v.post_id;
