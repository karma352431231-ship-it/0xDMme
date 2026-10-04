-- Small operational records; chat contents and action text remain E2EE.
ALTER TABLE hash_talk.message_packets ADD COLUMN relation jsonb;
ALTER TABLE hash_talk.message_packets ADD COLUMN deletion_account uuid REFERENCES hash_talk.accounts(id);
CREATE INDEX message_relation_target ON hash_talk.message_packets((relation->>'id'),sequence) WHERE relation IS NOT NULL;
CREATE TABLE hash_talk.daily_controls (
  account_id uuid PRIMARY KEY REFERENCES hash_talk.accounts(id) ON DELETE CASCADE,
  revision integer NOT NULL DEFAULT 0,
  profile_revision integer NOT NULL DEFAULT 0,
  online boolean NOT NULL DEFAULT false,
  last_seen boolean NOT NULL DEFAULT false,
  read_receipts boolean NOT NULL DEFAULT false,
  receipt_epoch integer NOT NULL DEFAULT 0,
  seen_at timestamptz,
  charge integer NOT NULL DEFAULT 512
);
CREATE TABLE hash_talk.conversation_controls (
  account_id uuid NOT NULL REFERENCES hash_talk.accounts(id) ON DELETE CASCADE,
  peer uuid NOT NULL REFERENCES hash_talk.accounts(id) ON DELETE CASCADE,
  revision integer NOT NULL DEFAULT 0,
  muted_until bigint NOT NULL DEFAULT 0,
  charge integer NOT NULL DEFAULT 512,
  PRIMARY KEY(account_id,peer), CHECK(account_id<>peer)
) WITH (autovacuum_vacuum_scale_factor=0.05,autovacuum_vacuum_threshold=20,
  autovacuum_analyze_scale_factor=0.05,autovacuum_analyze_threshold=20);
CREATE TABLE hash_talk.device_presence (
  account_id uuid NOT NULL REFERENCES hash_talk.accounts(id) ON DELETE CASCADE,
  device_id uuid NOT NULL,
  expires_at timestamptz NOT NULL,
  charge integer NOT NULL DEFAULT 256,
  PRIMARY KEY(account_id,device_id)
) WITH (autovacuum_vacuum_scale_factor=0.05,autovacuum_vacuum_threshold=20,
  autovacuum_analyze_scale_factor=0.05,autovacuum_analyze_threshold=20);
CREATE TABLE hash_talk.push_subscriptions (
  account_id uuid NOT NULL REFERENCES hash_talk.accounts(id) ON DELETE CASCADE,
  device_id uuid NOT NULL,
  endpoint text NOT NULL UNIQUE CHECK(octet_length(endpoint)<=2048),
  subscription jsonb NOT NULL CHECK(octet_length(subscription::text)<=2600),
  pending boolean NOT NULL DEFAULT false,
  generation bigint NOT NULL DEFAULT 0,
  attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 3),
  next_attempt timestamptz NOT NULL DEFAULT now(),
  charge integer NOT NULL,
  PRIMARY KEY(account_id,device_id)
) WITH (autovacuum_vacuum_scale_factor=0.05,autovacuum_vacuum_threshold=20,
  autovacuum_analyze_scale_factor=0.05,autovacuum_analyze_threshold=20);
CREATE INDEX push_due ON hash_talk.push_subscriptions(next_attempt) WHERE pending;
CREATE TRIGGER daily_usage AFTER INSERT OR DELETE OR UPDATE OF charge ON hash_talk.daily_controls FOR EACH ROW EXECUTE FUNCTION hash_talk.track_message_usage();
CREATE TRIGGER conversation_usage AFTER INSERT OR DELETE OR UPDATE OF charge ON hash_talk.conversation_controls FOR EACH ROW EXECUTE FUNCTION hash_talk.track_message_usage();
CREATE TRIGGER presence_usage AFTER INSERT OR DELETE ON hash_talk.device_presence FOR EACH ROW EXECUTE FUNCTION hash_talk.track_message_usage();
CREATE TRIGGER push_usage AFTER INSERT OR DELETE OR UPDATE OF charge ON hash_talk.push_subscriptions FOR EACH ROW EXECUTE FUNCTION hash_talk.track_message_usage();

CREATE TABLE hash_talk.message_reads (
  account_id uuid NOT NULL REFERENCES hash_talk.accounts(id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES hash_talk.message_packets(id) ON DELETE CASCADE,
  share_epoch integer,
  charge integer NOT NULL DEFAULT 256,
  PRIMARY KEY(account_id,message_id)
) WITH (autovacuum_vacuum_scale_factor=0.05,autovacuum_vacuum_threshold=20,
  autovacuum_analyze_scale_factor=0.05,autovacuum_analyze_threshold=20);
CREATE TRIGGER read_usage AFTER INSERT OR DELETE ON hash_talk.message_reads FOR EACH ROW EXECUTE FUNCTION hash_talk.track_message_usage();
