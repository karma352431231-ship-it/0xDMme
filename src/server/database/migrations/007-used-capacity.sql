-- Owner explicitly removed unused 300 MB account commitments on 02/10/2026.
-- Remove allocation counters only; preserve accounts, sessions and encrypted data.
ALTER TABLE hash_talk.accounts DROP COLUMN reserved_bytes;
DROP TABLE hash_talk.account_capacity;
