-- Bounded metadata journal. Immutable packets and deletion proofs stay authoritative.
CREATE TABLE hash_talk.message_changes (
  account_id uuid NOT NULL REFERENCES hash_talk.accounts(id) ON DELETE CASCADE,
  revision bigint NOT NULL CHECK(revision BETWEEN 1 AND 9007199254740991),
  ids uuid[] CHECK(cardinality(ids) BETWEEN 1 AND 65),
  charge integer NOT NULL CHECK(charge BETWEEN 512 AND 1552),
  PRIMARY KEY(account_id,revision)
) WITH (autovacuum_vacuum_scale_factor=0.05,autovacuum_vacuum_threshold=20,
  autovacuum_analyze_scale_factor=0.05,autovacuum_analyze_threshold=20);
CREATE TRIGGER track_message_change_content AFTER INSERT OR DELETE OR UPDATE OF charge
  ON hash_talk.message_changes FOR EACH ROW EXECUTE FUNCTION hash_talk.track_message_usage();
-- No history backfill: clients outside the retained journal do a verified full scan.
