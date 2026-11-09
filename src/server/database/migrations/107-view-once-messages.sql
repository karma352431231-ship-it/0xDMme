CREATE TABLE hash_talk.view_once_payloads (
  id uuid PRIMARY KEY,
  scope text NOT NULL CHECK(scope IN ('private','public')),
  policy text NOT NULL CHECK(policy IN ('mobile','file')),
  sender uuid NOT NULL REFERENCES hash_talk.accounts(id) ON DELETE CASCADE,
  recipient uuid NOT NULL REFERENCES hash_talk.accounts(id) ON DELETE CASCADE,
  sender_actor uuid NOT NULL,
  recipient_actor uuid NOT NULL,
  hash text NOT NULL CHECK(hash ~ '^[a-f0-9]{64}$'),
  header jsonb,
  ciphertext bytea NOT NULL DEFAULT ''::bytea,
  expected_bytes integer NOT NULL CHECK(expected_bytes BETWEEN 16 AND 14000000),
  ready boolean NOT NULL DEFAULT false,
  attached boolean NOT NULL DEFAULT false,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  charge bigint NOT NULL CHECK(charge >= 0),
  sender_charge bigint NOT NULL CHECK(sender_charge >= 0),
  recipient_charge bigint NOT NULL CHECK(recipient_charge >= 0),
  CHECK(sender <> recipient),
  CHECK(octet_length(ciphertext) <= expected_bytes),
  CHECK((consumed_at IS NULL AND header IS NOT NULL) OR
        (consumed_at IS NOT NULL AND header IS NULL AND octet_length(ciphertext)=0))
);
CREATE INDEX view_once_pending ON hash_talk.view_once_payloads(sender,recipient,created_at)
  WHERE NOT attached;
CREATE INDEX view_once_recipient ON hash_talk.view_once_payloads(recipient);

-- Reserve the complete encrypted payload before accepting its first chunk.
-- Reuse the same ledgers and global-before-personal order as ordinary content.
CREATE TRIGGER content_usage_insert AFTER INSERT ON hash_talk.view_once_payloads
  REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT
  EXECUTE FUNCTION hash_talk.track_statement_content_usage();
CREATE TRIGGER content_usage_update AFTER UPDATE ON hash_talk.view_once_payloads
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT
  EXECUTE FUNCTION hash_talk.track_statement_content_usage();
CREATE TRIGGER content_usage_delete AFTER DELETE ON hash_talk.view_once_payloads
  REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT
  EXECUTE FUNCTION hash_talk.track_statement_content_usage();
CREATE TRIGGER quota_usage_insert AFTER INSERT ON hash_talk.view_once_payloads
  REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT
  EXECUTE FUNCTION hash_talk.track_personal_quota('account_pair','sender');
CREATE TRIGGER quota_usage_update AFTER UPDATE ON hash_talk.view_once_payloads
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT
  EXECUTE FUNCTION hash_talk.track_personal_quota('account_pair','sender');
CREATE TRIGGER quota_usage_delete AFTER DELETE ON hash_talk.view_once_payloads
  REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT
  EXECUTE FUNCTION hash_talk.track_personal_quota('account_pair','sender');

DO $$
DECLARE previous text;
BEGIN
  previous:=regexp_replace(pg_get_viewdef('hash_talk.account_quota_totals'::regclass,true),';[[:space:]]*$','');
  EXECUTE 'CREATE OR REPLACE VIEW hash_talk.account_quota_totals AS
    SELECT account_id,sum(used_bytes)::bigint AS used_bytes FROM (
      SELECT account_id,used_bytes FROM ('||previous||') existing
      UNION ALL SELECT sender,sender_charge FROM hash_talk.view_once_payloads
      UNION ALL SELECT recipient,recipient_charge FROM hash_talk.view_once_payloads
    ) charged GROUP BY account_id';
END;
$$;

-- Removing an ordinary message also removes its independently gated payload.
CREATE FUNCTION hash_talk.remove_view_once_payload() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' OR NEW.body->'viewOnce' IS NULL THEN
    DELETE FROM hash_talk.view_once_payloads
      WHERE id=OLD.id AND scope=CASE WHEN TG_TABLE_NAME='social_messages' THEN 'public' ELSE 'private' END;
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER view_once_remove AFTER UPDATE OF body OR DELETE ON hash_talk.message_packets
  FOR EACH ROW EXECUTE FUNCTION hash_talk.remove_view_once_payload();
CREATE TRIGGER view_once_remove AFTER UPDATE OF body OR DELETE ON hash_talk.social_messages
  FOR EACH ROW EXECUTE FUNCTION hash_talk.remove_view_once_payload();
