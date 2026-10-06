-- Keep the inactive row as a revision tombstone. A delayed signed unblock
-- cannot override a newer block, including pairs with no DM request yet.
ALTER TABLE hash_talk.social_blocks ADD COLUMN blocked boolean NOT NULL DEFAULT true;
ALTER TABLE hash_talk.social_blocks ADD COLUMN revision bigint NOT NULL DEFAULT 1 CHECK(revision BETWEEN 1 AND 9007199254740991);
CREATE INDEX social_active_blocks ON hash_talk.social_blocks(actor,target) WHERE blocked;
