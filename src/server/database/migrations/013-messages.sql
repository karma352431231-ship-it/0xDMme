-- History payloads and pending references have different lifetimes.
CREATE TABLE hash_talk.message_packets (
  id uuid PRIMARY KEY,
  sender uuid NOT NULL REFERENCES hash_talk.accounts(id),
  recipient uuid NOT NULL REFERENCES hash_talk.accounts(id),
  sender_revision integer NOT NULL CHECK(sender_revision BETWEEN 1 AND 128),
  recipient_revision integer NOT NULL CHECK(recipient_revision BETWEEN 1 AND 128),
  deletion_revision integer CHECK(deletion_revision BETWEEN 1 AND 128),
  sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  hash text NOT NULL CHECK(hash ~ '^[a-f0-9]{64}$'),
  body jsonb CHECK(octet_length(body::text)<=8100000),
  deletion jsonb CHECK(octet_length(deletion::text)<=4096),
  queue_active boolean NOT NULL DEFAULT true,
  charge integer NOT NULL CHECK(charge>=0),
  sender_charge integer NOT NULL CHECK(sender_charge>=0),
  recipient_charge integer NOT NULL CHECK(recipient_charge>=0),
  CHECK(sender<>recipient),
  CHECK((body IS NULL)=(deletion IS NOT NULL)),
  CHECK(sequence<=9007199254740991)
) WITH (autovacuum_vacuum_scale_factor=0.05,autovacuum_vacuum_threshold=20,
  autovacuum_analyze_scale_factor=0.05,autovacuum_analyze_threshold=20);
CREATE INDEX message_packets_sender ON hash_talk.message_packets(sender,sequence);
CREATE INDEX message_packets_recipient ON hash_talk.message_packets(recipient,sequence);
CREATE TABLE hash_talk.message_references (
  message_id uuid NOT NULL REFERENCES hash_talk.message_packets(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES hash_talk.accounts(id) ON DELETE CASCADE,
  device_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','received','revoked')),
  PRIMARY KEY(message_id,account_id,device_id)
) WITH (autovacuum_vacuum_scale_factor=0.05,autovacuum_vacuum_threshold=20,
  autovacuum_analyze_scale_factor=0.05,autovacuum_analyze_threshold=20);
CREATE INDEX message_references_pending ON hash_talk.message_references(account_id,device_id,message_id) WHERE status='pending';
CREATE TABLE hash_talk.message_heads (
  account_id uuid PRIMARY KEY REFERENCES hash_talk.accounts(id) ON DELETE CASCADE,
  revision bigint NOT NULL DEFAULT 0 CHECK(revision BETWEEN 0 AND 9007199254740991)
);
CREATE FUNCTION hash_talk.track_message_usage() RETURNS trigger LANGUAGE plpgsql AS $$
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
CREATE TRIGGER track_message_content AFTER INSERT OR DELETE OR UPDATE OF charge
  ON hash_talk.message_packets FOR EACH ROW EXECUTE FUNCTION hash_talk.track_message_usage();
