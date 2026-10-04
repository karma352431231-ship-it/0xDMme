-- Shared conversation controls, private read consent, bounded profile reads and durable root retirement.
ALTER TABLE hash_talk.groups ADD COLUMN media_scope_retired boolean NOT NULL DEFAULT false;
-- Category already belongs to the signed packet. Project it without reading plaintext.
ALTER TABLE hash_talk.group_packets ADD COLUMN kind text GENERATED ALWAYS AS (body->>'kind') STORED;
CREATE INDEX group_scope_retirement ON hash_talk.groups(id) WHERE deleted AND NOT media_scope_retired;
CREATE INDEX group_latest_profile ON hash_talk.group_packets(group_id,sequence DESC) WHERE kind='profile' AND body IS NOT NULL;
CREATE TABLE hash_talk.group_controls (
  account_id uuid NOT NULL REFERENCES hash_talk.accounts(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES hash_talk.groups(id),
  revision integer NOT NULL DEFAULT 0,
  muted_until bigint NOT NULL DEFAULT 0 CHECK(muted_until BETWEEN 0 AND 9007199254740991),
  charge integer NOT NULL DEFAULT 512 CHECK(charge=512),
  PRIMARY KEY(account_id,group_id)
) WITH (autovacuum_vacuum_scale_factor=0.05,autovacuum_vacuum_threshold=20,
  autovacuum_analyze_scale_factor=0.05,autovacuum_analyze_threshold=20);
CREATE TRIGGER group_controls_usage AFTER INSERT OR DELETE ON hash_talk.group_controls FOR EACH ROW EXECUTE FUNCTION hash_talk.track_message_usage();
CREATE TABLE hash_talk.group_reads (
  account_id uuid NOT NULL REFERENCES hash_talk.accounts(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES hash_talk.groups(id),
  message_id uuid NOT NULL REFERENCES hash_talk.group_packets(id) ON DELETE CASCADE,
  share_epoch integer,
  charge integer NOT NULL DEFAULT 256 CHECK(charge=256),
  PRIMARY KEY(account_id,message_id)
) WITH (autovacuum_vacuum_scale_factor=0.05,autovacuum_vacuum_threshold=20,
  autovacuum_analyze_scale_factor=0.05,autovacuum_analyze_threshold=20);
CREATE INDEX group_read_scope ON hash_talk.group_reads(group_id,message_id);
CREATE TRIGGER group_reads_usage AFTER INSERT OR DELETE ON hash_talk.group_reads FOR EACH ROW EXECUTE FUNCTION hash_talk.track_message_usage();
