-- Public profile description: plain text written by the profile owner and
-- shown on its public page. Its own row keeps revision and capacity charge,
-- like banners; clearing keeps the row so the revision keeps counting.
CREATE TABLE hash_talk.public_profile_descriptions (
  profile_id uuid PRIMARY KEY REFERENCES hash_talk.public_profiles(id) ON DELETE CASCADE,
  revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
  description text NOT NULL CHECK(char_length(description)<=280),
  charge integer GENERATED ALWAYS AS (256+octet_length(description)) STORED
) WITH (autovacuum_vacuum_scale_factor=0.05,autovacuum_vacuum_threshold=20,
  autovacuum_analyze_scale_factor=0.05,autovacuum_analyze_threshold=20);
CREATE TRIGGER public_profile_description_usage AFTER INSERT OR DELETE OR UPDATE
ON hash_talk.public_profile_descriptions FOR EACH ROW EXECUTE FUNCTION hash_talk.track_message_usage();
