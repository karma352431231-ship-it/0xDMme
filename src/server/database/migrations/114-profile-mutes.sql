-- Mutes (owner decision 20/11/2026): a public profile hides another profile's
-- posts, replies and Activity notices from itself only. The muted profile is
-- not told and can still message, vote and follow. Unmuting keeps the row so
-- the revision stays monotonic; the store bounds rows per profile, and either
-- profile's deletion removes them.
CREATE TABLE hash_talk.public_profile_mutes (
  actor uuid NOT NULL REFERENCES hash_talk.public_profiles(id) ON DELETE CASCADE,
  target uuid NOT NULL REFERENCES hash_talk.public_profiles(id) ON DELETE CASCADE,
  muted boolean NOT NULL,
  revision integer NOT NULL CHECK(revision>0),
  PRIMARY KEY(actor,target), CHECK(actor<>target)
) WITH (autovacuum_vacuum_scale_factor=0.05,autovacuum_vacuum_threshold=20,
  autovacuum_analyze_scale_factor=0.05,autovacuum_analyze_threshold=20);
CREATE INDEX public_profile_active_mutes ON hash_talk.public_profile_mutes(actor,target) WHERE muted;
