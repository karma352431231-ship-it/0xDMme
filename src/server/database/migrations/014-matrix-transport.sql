CREATE TABLE hash_talk.matrix_devices (
  account_id uuid NOT NULL REFERENCES hash_talk.accounts(id) ON DELETE CASCADE,
  device_id uuid NOT NULL,
  binding jsonb NOT NULL CHECK(octet_length(binding::text)<=4096),
  charge integer NOT NULL CHECK(charge BETWEEN 512 AND 8192),
  PRIMARY KEY(account_id,device_id)
);
CREATE TABLE hash_talk.matrix_one_time_keys (
  account_id uuid NOT NULL,
  device_id uuid NOT NULL,
  id text NOT NULL CHECK(length(id)<=128),
  body jsonb NOT NULL CHECK(octet_length(body::text)<=1024),
  fallback boolean NOT NULL DEFAULT false,
  charge integer NOT NULL CHECK(charge BETWEEN 512 AND 2048),
  PRIMARY KEY(account_id,device_id,id),
  FOREIGN KEY(account_id,device_id) REFERENCES hash_talk.matrix_devices(account_id,device_id) ON DELETE CASCADE
) WITH (autovacuum_vacuum_scale_factor=0.05,autovacuum_vacuum_threshold=20,
  autovacuum_analyze_scale_factor=0.05,autovacuum_analyze_threshold=20);
CREATE TABLE hash_talk.matrix_envelopes (
  id text NOT NULL CHECK(length(id) BETWEEN 1 AND 128),
  sender uuid NOT NULL REFERENCES hash_talk.accounts(id),
  account_id uuid NOT NULL REFERENCES hash_talk.accounts(id),
  device_id uuid NOT NULL,
  sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  body jsonb CHECK(octet_length(body::text)<=16384),
  hash text NOT NULL CHECK(hash ~ '^[a-f0-9]{64}$'),
  charge integer NOT NULL CHECK(charge BETWEEN 512 AND 32768),
  PRIMARY KEY(sender,id,account_id,device_id),
  CHECK(sequence<=9007199254740991)
) WITH (autovacuum_vacuum_scale_factor=0.05,autovacuum_vacuum_threshold=20,
  autovacuum_analyze_scale_factor=0.05,autovacuum_analyze_threshold=20);
CREATE INDEX matrix_envelopes_pending ON hash_talk.matrix_envelopes(account_id,device_id,sequence);
CREATE TRIGGER track_matrix_envelope_content AFTER INSERT OR DELETE OR UPDATE OF charge
  ON hash_talk.matrix_envelopes FOR EACH ROW EXECUTE FUNCTION hash_talk.track_message_usage();

CREATE TRIGGER track_matrix_device_content AFTER INSERT OR DELETE OR UPDATE OF charge
  ON hash_talk.matrix_devices FOR EACH ROW EXECUTE FUNCTION hash_talk.track_message_usage();
CREATE TRIGGER track_matrix_key_content AFTER INSERT OR DELETE OR UPDATE OF charge
  ON hash_talk.matrix_one_time_keys FOR EACH ROW EXECUTE FUNCTION hash_talk.track_message_usage();
