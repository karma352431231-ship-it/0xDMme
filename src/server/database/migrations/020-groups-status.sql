-- Independent shared vault. All names/content/keys remain client-encrypted.
CREATE TABLE hash_talk.groups (
  id uuid PRIMARY KEY,
  owner uuid NOT NULL REFERENCES hash_talk.accounts(id),
  revision integer NOT NULL CHECK(revision BETWEEN 1 AND 2147483646),
  epoch integer NOT NULL CHECK(epoch BETWEEN 1 AND 2147483646),
  head text NOT NULL CHECK(head ~ '^[a-f0-9]{64}$'),
  event jsonb NOT NULL CHECK(octet_length(event::text)<=70000),
  deleted boolean NOT NULL DEFAULT false,
  charge integer NOT NULL CHECK(charge BETWEEN 512 AND 75000)
);
CREATE INDEX groups_owner ON hash_talk.groups(owner,id) WHERE NOT deleted;
CREATE TABLE hash_talk.group_events (
  group_id uuid NOT NULL REFERENCES hash_talk.groups(id),
  revision integer NOT NULL,
  epoch integer NOT NULL,
  hash text NOT NULL CHECK(hash ~ '^[a-f0-9]{64}$'),
  event jsonb NOT NULL CHECK(octet_length(event::text)<=70000),
  charge integer NOT NULL CHECK(charge BETWEEN 512 AND 75000),
  PRIMARY KEY(group_id,revision), UNIQUE(group_id,epoch)
);
CREATE TABLE hash_talk.group_members (
  group_id uuid NOT NULL REFERENCES hash_talk.groups(id),
  account_id uuid NOT NULL REFERENCES hash_talk.accounts(id),
  role text NOT NULL CHECK(role IN ('owner','admin','member')),
  joined integer NOT NULL CHECK(joined>0),
  charge integer NOT NULL DEFAULT 256 CHECK(charge=256),
  PRIMARY KEY(group_id,account_id)
);
CREATE INDEX groups_for_member ON hash_talk.group_members(account_id,group_id);
CREATE TABLE hash_talk.group_consents (
  id uuid PRIMARY KEY,
  group_id uuid NOT NULL REFERENCES hash_talk.groups(id),
  target uuid NOT NULL REFERENCES hash_talk.accounts(id),
  actor uuid NOT NULL REFERENCES hash_talk.accounts(id),
  kind text NOT NULL CHECK(kind IN ('invite','transfer')),
  head text NOT NULL CHECK(head ~ '^[a-f0-9]{64}$'),
  proof jsonb NOT NULL CHECK(octet_length(proof::text)<=4096),
  charge integer NOT NULL CHECK(charge BETWEEN 512 AND 8192)
);
CREATE UNIQUE INDEX group_one_consent ON hash_talk.group_consents(group_id,target,kind);
CREATE INDEX group_incoming_consent ON hash_talk.group_consents(target,id);
-- Only successful creations. One-hour operational window survives restart/deletion.
CREATE TABLE hash_talk.group_creation_window (
  account_id uuid NOT NULL REFERENCES hash_talk.accounts(id),
  group_id uuid PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  charge integer NOT NULL DEFAULT 256 CHECK(charge=256)
) WITH (autovacuum_vacuum_scale_factor=0.05,autovacuum_vacuum_threshold=20,
  autovacuum_analyze_scale_factor=0.05,autovacuum_analyze_threshold=20);
CREATE INDEX group_creation_recent ON hash_talk.group_creation_window(account_id,created_at);

CREATE TRIGGER group_usage AFTER INSERT OR DELETE OR UPDATE OF charge ON hash_talk.groups FOR EACH ROW EXECUTE FUNCTION hash_talk.track_message_usage();
CREATE TRIGGER group_event_usage AFTER INSERT OR DELETE ON hash_talk.group_events FOR EACH ROW EXECUTE FUNCTION hash_talk.track_message_usage();
CREATE TRIGGER group_member_usage AFTER INSERT OR DELETE ON hash_talk.group_members FOR EACH ROW EXECUTE FUNCTION hash_talk.track_message_usage();
CREATE TRIGGER group_consent_usage AFTER INSERT OR DELETE OR UPDATE OF charge ON hash_talk.group_consents FOR EACH ROW EXECUTE FUNCTION hash_talk.track_message_usage();
CREATE TRIGGER group_creation_usage AFTER INSERT OR DELETE ON hash_talk.group_creation_window FOR EACH ROW EXECUTE FUNCTION hash_talk.track_message_usage();
