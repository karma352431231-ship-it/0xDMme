-- Payload bytes remain in isolated filesystem objects; no plaintext media metadata.
ALTER TABLE hash_talk.message_packets DROP CONSTRAINT message_packets_kind_check;
ALTER TABLE hash_talk.message_packets ADD CONSTRAINT message_packets_kind_check CHECK(kind IN ('text','profile','attachment'));
CREATE TABLE hash_talk.message_attachments (
  id uuid PRIMARY KEY,
  message_id uuid NOT NULL,
  sender uuid NOT NULL REFERENCES hash_talk.accounts(id),
  recipient uuid NOT NULL REFERENCES hash_talk.accounts(id),
  descriptor jsonb NOT NULL CHECK(octet_length(descriptor::text)<4096),
  bytes integer NOT NULL CHECK(bytes BETWEEN 1 AND 3000000),
  status text NOT NULL DEFAULT 'reserved' CHECK(status IN ('reserved','writing','ready','accepted','deleting')),
  received integer[] NOT NULL DEFAULT '{}',
  writer uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  charge integer NOT NULL CHECK(charge>=0),
  CHECK(sender<>recipient),
  CHECK((status='writing')=(writer IS NOT NULL))
) WITH (autovacuum_vacuum_scale_factor=0.05,autovacuum_vacuum_threshold=20,
  autovacuum_analyze_scale_factor=0.05,autovacuum_analyze_threshold=20);
CREATE INDEX message_attachments_message ON hash_talk.message_attachments(message_id);
CREATE INDEX message_attachments_sender ON hash_talk.message_attachments(sender) WHERE status<>'accepted';
CREATE INDEX message_attachments_recipient ON hash_talk.message_attachments(recipient);
CREATE INDEX message_attachments_cleanup ON hash_talk.message_attachments(created_at) WHERE status IN ('reserved','ready','deleting');
CREATE TRIGGER track_attachment_content AFTER INSERT OR DELETE OR UPDATE OF charge
  ON hash_talk.message_attachments FOR EACH ROW EXECUTE FUNCTION hash_talk.track_message_usage();
