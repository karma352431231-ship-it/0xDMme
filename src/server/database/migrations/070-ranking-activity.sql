-- Ranking activity (16/10/2026): public voters count as active members, so a
-- vote records when it was last cast. Existing votes keep NULL (time unknown,
-- not counted); no backfill and no new rows.
ALTER TABLE hash_talk.community_votes ADD COLUMN voted_at timestamptz(3);
CREATE INDEX community_votes_recent ON hash_talk.community_votes(voted_at)
  WHERE voted_at IS NOT NULL AND position<>0;
-- Active members in the previous window, so the sidebar can show growth.
ALTER TABLE hash_talk.community_ranking_entries
  ADD COLUMN previous_participants integer NOT NULL DEFAULT 0
  CHECK(previous_participants>=0);
