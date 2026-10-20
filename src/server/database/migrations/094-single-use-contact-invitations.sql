-- Independent 24-hour, one-request grants. Only token hashes reach the backend.
-- Contact operational metadata remains outside the owner's content quota;
-- every row still contributes to global storage admission and cleanup.
CREATE TABLE hash_talk.contact_invitations (
  account_id uuid NOT NULL REFERENCES hash_talk.accounts(id) ON DELETE CASCADE,
  token_hash text NOT NULL CHECK(token_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz NOT NULL,
  used_by uuid REFERENCES hash_talk.accounts(id) ON DELETE SET NULL,
  consumed_at timestamptz,
  charge integer NOT NULL DEFAULT 256 CHECK(charge=256),
  PRIMARY KEY(account_id,token_hash),
  CHECK(consumed_at IS NOT NULL OR used_by IS NULL)
) WITH (autovacuum_vacuum_scale_factor=0.05,autovacuum_vacuum_threshold=20,
  autovacuum_analyze_scale_factor=0.05,autovacuum_analyze_threshold=20);
CREATE INDEX contact_invitation_expiry ON hash_talk.contact_invitations(expires_at);
CREATE TRIGGER content_allocation_source BEFORE INSERT OR UPDATE OR DELETE ON hash_talk.contact_invitations
  FOR EACH ROW EXECUTE FUNCTION hash_talk.enforce_allocated_source();
CREATE TRIGGER content_usage_insert AFTER INSERT ON hash_talk.contact_invitations
  REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT
  EXECUTE FUNCTION hash_talk.track_statement_content_usage();
CREATE TRIGGER content_usage_delete AFTER DELETE ON hash_talk.contact_invitations
  REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT
  EXECUTE FUNCTION hash_talk.track_statement_content_usage();
CREATE FUNCTION hash_talk.wake_contact_invitation_cleanup() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify('hash_talk_contact_invites','');
  RETURN NULL;
END;
$$;
CREATE TRIGGER invitation_cleanup_hint AFTER INSERT ON hash_talk.contact_invitations
  FOR EACH STATEMENT EXECUTE FUNCTION hash_talk.wake_contact_invitation_cleanup();
-- Existing shared links get one bounded transition window, never permanent reuse.
INSERT INTO hash_talk.contact_invitations(account_id,token_hash,expires_at)
  SELECT account_id,invite_hash,now()+interval '24 hours'
  FROM hash_talk.contact_controls WHERE invite_hash IS NOT NULL;
UPDATE hash_talk.contact_controls SET invite_hash=NULL,revision=revision+1 WHERE invite_hash IS NOT NULL;
