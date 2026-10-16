-- Existing communities deliberately keep their UUID addresses. No backfill.
CREATE TABLE hash_talk.community_addresses (
  community_id uuid PRIMARY KEY REFERENCES hash_talk.communities(id) ON DELETE CASCADE,
  slug text NOT NULL UNIQUE CHECK(length(slug) BETWEEN 1 AND 96 AND slug !~ '[/[:space:]]'),
  charge integer GENERATED ALWAYS AS (256+octet_length(slug)) STORED
) WITH (autovacuum_vacuum_scale_factor=0.05,autovacuum_vacuum_threshold=20,
  autovacuum_analyze_scale_factor=0.05,autovacuum_analyze_threshold=20);
CREATE TRIGGER community_address_usage AFTER INSERT OR DELETE OR UPDATE ON hash_talk.community_addresses
  FOR EACH ROW EXECUTE FUNCTION hash_talk.track_message_usage();
