-- Public identity is optional and separate from private profile/crypto formats.
-- Deleting an account releases its handle. Never identify future authors by handle.
CREATE TABLE hash_talk.public_profiles (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL UNIQUE REFERENCES hash_talk.accounts(id) ON DELETE CASCADE,
  handle text NOT NULL UNIQUE CHECK(handle ~ '^[a-z0-9_]{3,30}$' AND handle ~ '[a-z0-9]'),
  revision integer NOT NULL DEFAULT 1 CHECK(revision > 0),
  pending_avatar bytea CHECK(octet_length(pending_avatar) BETWEEN 1 AND 3000000),
  pending_avatar_type text CHECK(pending_avatar_type IN ('image/png','image/jpeg')),
  charge integer GENERATED ALWAYS AS (512 + coalesce(octet_length(pending_avatar),0)) STORED,
  CHECK((pending_avatar IS NULL)=(pending_avatar_type IS NULL))
) WITH (autovacuum_vacuum_scale_factor=0.05,autovacuum_vacuum_threshold=20,
  autovacuum_analyze_scale_factor=0.05,autovacuum_analyze_threshold=20);
-- Pending photos are never publicly served. Only global capacity is charged.
CREATE TRIGGER public_profile_usage AFTER INSERT OR DELETE OR UPDATE
ON hash_talk.public_profiles FOR EACH ROW EXECUTE FUNCTION hash_talk.track_message_usage();
