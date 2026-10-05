-- Account preference only. Call metadata, signals and history never enter SQL.
CREATE TABLE hash_talk.call_controls (
  account_id uuid PRIMARY KEY REFERENCES hash_talk.accounts(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  revision integer NOT NULL CHECK (revision > 0),
  charge integer NOT NULL DEFAULT 256
);
CREATE TRIGGER call_preference_usage AFTER INSERT OR DELETE OR UPDATE OF charge
ON hash_talk.call_controls FOR EACH ROW EXECUTE FUNCTION hash_talk.track_message_usage();
