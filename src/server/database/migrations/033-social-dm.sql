-- Independent consent and crypto identities. Private account/device mappings
-- never form part of the protocol objects returned to another participant.
CREATE TABLE hash_talk.social_relations (
  lo uuid NOT NULL REFERENCES hash_talk.public_profiles(id) ON DELETE CASCADE,
  hi uuid NOT NULL REFERENCES hash_talk.public_profiles(id) ON DELETE CASCADE,
  requester uuid NOT NULL REFERENCES hash_talk.public_profiles(id) ON DELETE CASCADE,
  state text NOT NULL CHECK(state IN ('pending','approved','rejected')),
  revision bigint NOT NULL CHECK(revision BETWEEN 1 AND 9007199254740991),
  charge integer NOT NULL DEFAULT 512 CHECK(charge=512),
  PRIMARY KEY(lo,hi), CHECK(lo<hi), CHECK(requester IN (lo,hi))
);
CREATE INDEX social_relations_hi ON hash_talk.social_relations(hi,lo);
CREATE TABLE hash_talk.social_blocks (
  actor uuid NOT NULL REFERENCES hash_talk.public_profiles(id) ON DELETE CASCADE,
  target uuid NOT NULL REFERENCES hash_talk.public_profiles(id) ON DELETE CASCADE,
  charge integer NOT NULL DEFAULT 256 CHECK(charge=256),
  PRIMARY KEY(actor,target), CHECK(actor<>target)
);
CREATE TABLE hash_talk.social_directories (
  profile_id uuid NOT NULL REFERENCES hash_talk.public_profiles(id) ON DELETE CASCADE,
  revision integer NOT NULL CHECK(revision BETWEEN 1 AND 128),
  body jsonb NOT NULL CHECK(octet_length(body::text)<=65536),
  hash text NOT NULL CHECK(hash ~ '^[a-f0-9]{64}$'),
  charge integer NOT NULL CHECK(charge>0),
  PRIMARY KEY(profile_id,revision)
);
CREATE TABLE hash_talk.social_devices (
  profile_id uuid NOT NULL REFERENCES hash_talk.public_profiles(id) ON DELETE CASCADE,
  device_id uuid NOT NULL,
  private_device uuid NOT NULL,
  PRIMARY KEY(profile_id,device_id), UNIQUE(profile_id,private_device)
);
CREATE TABLE hash_talk.social_recovery (
  profile_id uuid NOT NULL REFERENCES hash_talk.public_profiles(id) ON DELETE CASCADE,
  epoch integer NOT NULL CHECK(epoch BETWEEN 1 AND 128),
  id uuid NOT NULL UNIQUE,
  body jsonb NOT NULL CHECK(octet_length(body::text)<=8192),
  charge integer NOT NULL CHECK(charge>0),
  PRIMARY KEY(profile_id,epoch)
);
CREATE TABLE hash_talk.social_matrix_devices (
  profile_id uuid NOT NULL REFERENCES hash_talk.public_profiles(id) ON DELETE CASCADE,
  device_id uuid NOT NULL,
  binding jsonb NOT NULL CHECK(octet_length(binding::text)<=8192),
  charge integer NOT NULL CHECK(charge>0),
  PRIMARY KEY(profile_id,device_id),
  FOREIGN KEY(profile_id,device_id) REFERENCES hash_talk.social_devices(profile_id,device_id) ON DELETE CASCADE
);
CREATE TABLE hash_talk.social_matrix_keys (
  profile_id uuid NOT NULL,
  device_id uuid NOT NULL,
  id text NOT NULL CHECK(length(id)<=128),
  fallback boolean NOT NULL,
  body jsonb NOT NULL CHECK(octet_length(body::text)<=2048),
  charge integer NOT NULL CHECK(charge>0),
  PRIMARY KEY(profile_id,device_id,id),
  FOREIGN KEY(profile_id,device_id) REFERENCES hash_talk.social_matrix_devices(profile_id,device_id) ON DELETE CASCADE
);
CREATE TABLE hash_talk.social_matrix_envelopes (
  sender uuid NOT NULL REFERENCES hash_talk.public_profiles(id) ON DELETE CASCADE,
  sender_device uuid NOT NULL,
  txn text NOT NULL CHECK(length(txn)<=128),
  recipient uuid NOT NULL REFERENCES hash_talk.public_profiles(id) ON DELETE CASCADE,
  device_id uuid NOT NULL,
  sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE CHECK(sequence<=9007199254740991),
  hash text NOT NULL CHECK(hash ~ '^[a-f0-9]{64}$'),
  body jsonb CHECK(octet_length(body::text)<=24000),
  charge integer NOT NULL CHECK(charge>0),
  PRIMARY KEY(sender,sender_device,txn,recipient,device_id)
) WITH (autovacuum_vacuum_scale_factor=0.05,autovacuum_vacuum_threshold=20);
CREATE INDEX social_matrix_inbox ON hash_talk.social_matrix_envelopes(recipient,device_id,sequence) WHERE body IS NOT NULL;
CREATE TABLE hash_talk.social_messages (
  id uuid PRIMARY KEY,
  sender uuid NOT NULL REFERENCES hash_talk.public_profiles(id) ON DELETE CASCADE,
  recipient uuid NOT NULL REFERENCES hash_talk.public_profiles(id) ON DELETE CASCADE,
  sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE CHECK(sequence<=9007199254740991),
  hash text NOT NULL CHECK(hash ~ '^[a-f0-9]{64}$'),
  body jsonb NOT NULL CHECK(octet_length(body::text)<=8100000),
  charge integer NOT NULL CHECK(charge>0),
  personal_charge integer NOT NULL CHECK(personal_charge>0),
  CHECK(sender<>recipient)
);
CREATE INDEX social_messages_sender ON hash_talk.social_messages(sender,recipient,sequence DESC);
CREATE INDEX social_messages_recipient ON hash_talk.social_messages(recipient,sender,sequence DESC);
CREATE TRIGGER social_relations_usage AFTER INSERT OR DELETE OR UPDATE OF charge ON hash_talk.social_relations FOR EACH ROW EXECUTE FUNCTION hash_talk.track_message_usage();
CREATE TRIGGER social_blocks_usage AFTER INSERT OR DELETE OR UPDATE OF charge ON hash_talk.social_blocks FOR EACH ROW EXECUTE FUNCTION hash_talk.track_message_usage();
CREATE TRIGGER social_directories_usage AFTER INSERT OR DELETE OR UPDATE OF charge ON hash_talk.social_directories FOR EACH ROW EXECUTE FUNCTION hash_talk.track_message_usage();
CREATE TRIGGER social_recovery_usage AFTER INSERT OR DELETE OR UPDATE OF charge ON hash_talk.social_recovery FOR EACH ROW EXECUTE FUNCTION hash_talk.track_message_usage();
CREATE TRIGGER social_matrix_devices_usage AFTER INSERT OR DELETE OR UPDATE OF charge ON hash_talk.social_matrix_devices FOR EACH ROW EXECUTE FUNCTION hash_talk.track_message_usage();
CREATE TRIGGER social_matrix_keys_usage AFTER INSERT OR DELETE OR UPDATE OF charge ON hash_talk.social_matrix_keys FOR EACH ROW EXECUTE FUNCTION hash_talk.track_message_usage();
CREATE TRIGGER social_matrix_envelopes_usage AFTER INSERT OR DELETE OR UPDATE OF charge ON hash_talk.social_matrix_envelopes FOR EACH ROW EXECUTE FUNCTION hash_talk.track_message_usage();
CREATE TRIGGER social_messages_usage AFTER INSERT OR DELETE OR UPDATE OF charge ON hash_talk.social_messages FOR EACH ROW EXECUTE FUNCTION hash_talk.track_message_usage();
