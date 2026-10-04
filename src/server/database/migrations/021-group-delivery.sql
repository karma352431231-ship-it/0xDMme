-- Immutable ciphertext and recoverable SDK sessions, charged to the shared vault.
CREATE INDEX group_event_actor ON hash_talk.group_events(group_id,(event->>'actor'));
CREATE TABLE hash_talk.group_key_sets (
  hash text PRIMARY KEY CHECK(hash ~ '^[a-f0-9]{64}$'),
  group_id uuid NOT NULL REFERENCES hash_talk.groups(id),
  epoch integer NOT NULL CHECK(epoch>0),
  sender uuid NOT NULL REFERENCES hash_talk.accounts(id),
  body jsonb NOT NULL CHECK(octet_length(body::text)<=2200000),
  charge integer NOT NULL CHECK(charge BETWEEN 512 AND 2300000)
);
CREATE INDEX group_keys_period ON hash_talk.group_key_sets(group_id,epoch);
CREATE TABLE hash_talk.group_packets (
  id uuid PRIMARY KEY,
  group_id uuid NOT NULL REFERENCES hash_talk.groups(id),
  epoch integer NOT NULL CHECK(epoch>0),
  sender uuid NOT NULL REFERENCES hash_talk.accounts(id),
  key_hash text NOT NULL REFERENCES hash_talk.group_key_sets(hash),
  sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE CHECK(sequence<=9007199254740991),
  hash text NOT NULL CHECK(hash ~ '^[a-f0-9]{64}$'),
  body jsonb CHECK(octet_length(body::text)<=4300000),
  deletion jsonb CHECK(octet_length(deletion::text)<=4096),
  pending_accounts uuid[] NOT NULL,
  received_accounts uuid[] NOT NULL DEFAULT '{}',
  charge integer NOT NULL CHECK(charge BETWEEN 512 AND 4400000),
  CHECK((body IS NULL)=(deletion IS NOT NULL)),
  CHECK(cardinality(pending_accounts)+cardinality(received_accounts)<=200)
) WITH (autovacuum_vacuum_scale_factor=0.05,autovacuum_vacuum_threshold=20,
  autovacuum_analyze_scale_factor=0.05,autovacuum_analyze_threshold=20);
CREATE INDEX group_packets_history ON hash_talk.group_packets(group_id,sequence);
CREATE TABLE hash_talk.group_matrix_envelopes (
  group_id uuid NOT NULL REFERENCES hash_talk.groups(id),
  epoch integer NOT NULL CHECK(epoch>0),
  id text NOT NULL CHECK(length(id) BETWEEN 1 AND 128),
  sender uuid NOT NULL REFERENCES hash_talk.accounts(id),
  account_id uuid NOT NULL REFERENCES hash_talk.accounts(id),
  device_id uuid NOT NULL,
  sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE CHECK(sequence<=9007199254740991),
  body jsonb CHECK(octet_length(body::text)<=16384),
  hash text NOT NULL CHECK(hash ~ '^[a-f0-9]{64}$'),
  charge integer NOT NULL CHECK(charge BETWEEN 512 AND 32768),
  PRIMARY KEY(group_id,sender,id,account_id,device_id)
) WITH (autovacuum_vacuum_scale_factor=0.05,autovacuum_vacuum_threshold=20,
  autovacuum_analyze_scale_factor=0.05,autovacuum_analyze_threshold=20);
CREATE INDEX group_matrix_pending ON hash_talk.group_matrix_envelopes(account_id,device_id,sequence) WHERE body IS NOT NULL;
CREATE TRIGGER group_key_usage AFTER INSERT OR DELETE ON hash_talk.group_key_sets FOR EACH ROW EXECUTE FUNCTION hash_talk.track_message_usage();
CREATE TRIGGER group_packet_usage AFTER INSERT OR DELETE OR UPDATE OF charge ON hash_talk.group_packets FOR EACH ROW EXECUTE FUNCTION hash_talk.track_message_usage();
CREATE TRIGGER group_matrix_usage AFTER INSERT OR DELETE OR UPDATE OF charge ON hash_talk.group_matrix_envelopes FOR EACH ROW EXECUTE FUNCTION hash_talk.track_message_usage();
ALTER TABLE hash_talk.group_members SET (autovacuum_vacuum_scale_factor=0.05,autovacuum_vacuum_threshold=20,autovacuum_analyze_scale_factor=0.05,autovacuum_analyze_threshold=20);
ALTER TABLE hash_talk.group_consents SET (autovacuum_vacuum_scale_factor=0.05,autovacuum_vacuum_threshold=20,autovacuum_analyze_scale_factor=0.05,autovacuum_analyze_threshold=20);
