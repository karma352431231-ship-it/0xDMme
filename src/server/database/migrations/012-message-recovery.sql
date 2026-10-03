-- Account/epoch keys for encrypted, recoverable room-key archives. No plaintext key.
CREATE TABLE hash_talk.message_recovery_keys (
  account_id uuid NOT NULL REFERENCES hash_talk.accounts(id) ON DELETE CASCADE,
  epoch integer NOT NULL CHECK(epoch BETWEEN 1 AND 128),
  id uuid UNIQUE NOT NULL,
  body jsonb NOT NULL CHECK(octet_length(body::text)<=4096),
  charge integer NOT NULL CHECK(charge BETWEEN 4096 AND 8192),
  PRIMARY KEY(account_id,epoch)
) WITH (autovacuum_vacuum_scale_factor=0.05,autovacuum_vacuum_threshold=20,
  autovacuum_analyze_scale_factor=0.05,autovacuum_analyze_threshold=20);

CREATE FUNCTION hash_talk.track_message_recovery_usage() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE before_bytes bigint:=0; after_bytes bigint:=0;
BEGIN
  IF TG_OP<>'INSERT' THEN before_bytes:=OLD.charge; END IF;
  IF TG_OP<>'DELETE' THEN after_bytes:=NEW.charge; END IF;
  IF before_bytes<>after_bytes THEN
    UPDATE hash_talk.content_usage SET used_bytes=used_bytes+after_bytes-before_bytes WHERE singleton;
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER track_message_recovery_content AFTER INSERT OR DELETE OR UPDATE OF charge
  ON hash_talk.message_recovery_keys FOR EACH ROW EXECUTE FUNCTION hash_talk.track_message_recovery_usage();
