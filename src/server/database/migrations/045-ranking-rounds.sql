-- Persist the cutoff across bounded batches, retaining notices received during a round.
ALTER TABLE hash_talk.community_ranking_settings ADD COLUMN round_cutoff timestamptz(3);
