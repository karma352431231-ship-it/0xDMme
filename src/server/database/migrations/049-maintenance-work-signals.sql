-- Hints only: existing state/deadlines remain the durable source of truth.
CREATE FUNCTION hash_talk.wake_maintenance() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify('hash_talk_'||replace(TG_ARGV[0],'-','_'),'');
  IF TG_TABLE_NAME='public_moderation' THEN
    PERFORM pg_notify('hash_talk_public_media','');
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER backups_work AFTER INSERT OR DELETE OR UPDATE OF retained_bytes ON hash_talk.personal_removals
  FOR EACH ROW EXECUTE FUNCTION hash_talk.wake_maintenance('backups');
CREATE TRIGGER attachments_work AFTER INSERT OR DELETE OR UPDATE OF status ON hash_talk.message_attachments
  FOR EACH ROW EXECUTE FUNCTION hash_talk.wake_maintenance('attachments');
CREATE TRIGGER social_media_work AFTER INSERT OR DELETE OR UPDATE OF status,lease_at ON hash_talk.social_media
  FOR EACH ROW EXECUTE FUNCTION hash_talk.wake_maintenance('social-media');
CREATE TRIGGER group_media_work AFTER INSERT OR DELETE OR UPDATE OF status,cleanup ON hash_talk.group_media
  FOR EACH ROW EXECUTE FUNCTION hash_talk.wake_maintenance('group-media');
CREATE TRIGGER group_cleanup_work AFTER INSERT OR DELETE OR UPDATE ON hash_talk.group_cleanups
  FOR EACH ROW EXECUTE FUNCTION hash_talk.wake_maintenance('group-media');
CREATE TRIGGER group_scope_work AFTER UPDATE OF deleted,clearing ON hash_talk.groups
  FOR EACH ROW EXECUTE FUNCTION hash_talk.wake_maintenance('group-media');
CREATE TRIGGER group_reads_work AFTER INSERT OR DELETE ON hash_talk.group_reads
  FOR EACH ROW EXECUTE FUNCTION hash_talk.wake_maintenance('group-daily');
CREATE TRIGGER group_packet_work AFTER UPDATE OF body ON hash_talk.group_packets
  FOR EACH ROW EXECUTE FUNCTION hash_talk.wake_maintenance('group-daily');
CREATE TRIGGER status_work AFTER INSERT OR DELETE OR UPDATE OF state,expires_at,notice_pending ON hash_talk.status_posts
  FOR EACH ROW EXECUTE FUNCTION hash_talk.wake_maintenance('status');
CREATE TRIGGER status_media_work AFTER INSERT OR DELETE OR UPDATE OF status ON hash_talk.status_media
  FOR EACH ROW EXECUTE FUNCTION hash_talk.wake_maintenance('status');
CREATE TRIGGER domain_work AFTER INSERT OR DELETE OR UPDATE ON hash_talk.organization_domains
  FOR EACH ROW EXECUTE FUNCTION hash_talk.wake_maintenance('representatives');
CREATE TRIGGER public_media_work AFTER INSERT OR DELETE OR UPDATE OF status,writer,charge,post_id,author ON hash_talk.community_media
  FOR EACH ROW EXECUTE FUNCTION hash_talk.wake_maintenance('public-media');
CREATE TRIGGER moderation_work AFTER INSERT OR DELETE OR UPDATE OF status,lease_until,next_attempt_at,policy ON hash_talk.public_moderation
  FOR EACH ROW EXECUTE FUNCTION hash_talk.wake_maintenance('public-moderation');
CREATE TRIGGER post_view_retirement AFTER UPDATE OF deleted ON hash_talk.community_posts
  FOR EACH ROW WHEN (NEW.deleted AND NOT OLD.deleted)
  EXECUTE FUNCTION hash_talk.wake_maintenance('post-views');
CREATE INDEX attachment_expiry ON hash_talk.message_attachments(created_at,id) WHERE status IN ('reserved','ready');
CREATE INDEX social_media_expiry ON hash_talk.social_media(reserved_at,id) WHERE status IN ('reserved','ready');
CREATE INDEX status_draft_expiry ON hash_talk.status_posts(created_at,id) WHERE state='draft';
