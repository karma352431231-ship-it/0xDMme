-- One revocable bearer grant per group. The secret and group title never reach this table.
CREATE TABLE hash_talk.group_links (
  group_id uuid PRIMARY KEY REFERENCES hash_talk.groups(id) ON DELETE CASCADE,
  proof jsonb NOT NULL CHECK(octet_length(proof::text)<=4096),
  charge integer NOT NULL CHECK(charge BETWEEN 512 AND 8192)
) WITH (autovacuum_vacuum_scale_factor=0.05,autovacuum_vacuum_threshold=20,
  autovacuum_analyze_scale_factor=0.05,autovacuum_analyze_threshold=20);
CREATE TRIGGER group_link_usage AFTER INSERT OR DELETE OR UPDATE OF charge ON hash_talk.group_links
  FOR EACH ROW EXECUTE FUNCTION hash_talk.track_message_usage();
