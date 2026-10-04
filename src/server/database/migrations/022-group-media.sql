-- Group bytes have their own vault budget and isolated filesystem namespace.
ALTER TABLE hash_talk.groups ADD COLUMN clearing boolean NOT NULL DEFAULT false;
ALTER TABLE hash_talk.group_packets ALTER COLUMN key_hash DROP NOT NULL;
CREATE TABLE hash_talk.group_media (
  id uuid PRIMARY KEY,
  group_id uuid NOT NULL REFERENCES hash_talk.groups(id),
  epoch integer NOT NULL CHECK(epoch>0),
  message_id uuid NOT NULL,
  sender uuid NOT NULL REFERENCES hash_talk.accounts(id),
  descriptor jsonb NOT NULL CHECK(octet_length(descriptor::text)<4096),
  bytes integer NOT NULL CHECK(bytes BETWEEN 1 AND 3000000),
  text_charge integer NOT NULL CHECK(text_charge BETWEEN 512 AND 8192),
  charge integer NOT NULL CHECK(charge=bytes+text_charge),
  status text NOT NULL DEFAULT 'reserved' CHECK(status IN ('reserved','writing','ready','accepted','deleting')),
  received integer[] NOT NULL DEFAULT '{}',
  writer uuid,
  sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE CHECK(sequence<=9007199254740991),
  accepted_at timestamptz,
  cleanup uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK((status='writing')=(writer IS NOT NULL)),
  CHECK(cardinality(received)<=12)
) WITH (autovacuum_vacuum_scale_factor=0.05,autovacuum_vacuum_threshold=20,
  autovacuum_analyze_scale_factor=0.05,autovacuum_analyze_threshold=20);
CREATE INDEX group_media_message ON hash_talk.group_media(group_id,message_id);
CREATE INDEX group_media_period ON hash_talk.group_media(group_id,epoch,sequence);
CREATE INDEX group_media_retention ON hash_talk.group_media(group_id,accepted_at,sequence) WHERE status='accepted';
CREATE INDEX group_media_pending ON hash_talk.group_media(sender) WHERE status IN ('reserved','writing','ready');
CREATE TABLE hash_talk.group_cleanups (
  group_id uuid PRIMARY KEY REFERENCES hash_talk.groups(id),
  id uuid NOT NULL UNIQUE,
  remaining integer NOT NULL CHECK(remaining>=0),
  after_sequence bigint NOT NULL DEFAULT 0 CHECK(after_sequence>=0),
  selected_bytes integer NOT NULL DEFAULT 0 CHECK(selected_bytes>=0),
  due_at timestamptz,
  charge integer NOT NULL DEFAULT 512 CHECK(charge=512)
);
CREATE INDEX group_cleanups_due ON hash_talk.group_cleanups(due_at) WHERE due_at IS NOT NULL;
CREATE TRIGGER group_media_usage AFTER INSERT OR DELETE OR UPDATE OF charge ON hash_talk.group_media FOR EACH ROW EXECUTE FUNCTION hash_talk.track_message_usage();
CREATE TRIGGER group_cleanup_usage AFTER INSERT OR DELETE ON hash_talk.group_cleanups FOR EACH ROW EXECUTE FUNCTION hash_talk.track_message_usage();
