-- Device preferences only. No call metadata or pending call enters SQL.
CREATE TABLE hash_talk.push_controls (
  account_id uuid NOT NULL REFERENCES hash_talk.accounts(id) ON DELETE CASCADE,
  device_id uuid NOT NULL,
  messages boolean NOT NULL DEFAULT true,
  calls boolean NOT NULL DEFAULT true,
  show_calls boolean NOT NULL DEFAULT true,
  charge integer NOT NULL DEFAULT 256,
  PRIMARY KEY(account_id,device_id)
) WITH (autovacuum_vacuum_scale_factor=0.05,autovacuum_vacuum_threshold=20,
  autovacuum_analyze_scale_factor=0.05,autovacuum_analyze_threshold=20);
CREATE TRIGGER push_controls_usage AFTER INSERT OR DELETE OR UPDATE OF charge
ON hash_talk.push_controls FOR EACH ROW EXECUTE FUNCTION hash_talk.track_message_usage();
