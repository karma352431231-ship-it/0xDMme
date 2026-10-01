-- Preserve existing EVM accounts and applied migration checksums.
ALTER TABLE hash_talk.accounts ADD COLUMN ecosystem text NOT NULL DEFAULT 'evm';
ALTER TABLE hash_talk.accounts DROP CONSTRAINT accounts_address_key;
ALTER TABLE hash_talk.accounts DROP CONSTRAINT accounts_address_check;
ALTER TABLE hash_talk.accounts ADD CONSTRAINT accounts_identity_unique UNIQUE (ecosystem, address);
ALTER TABLE hash_talk.accounts ADD CONSTRAINT accounts_identity_check CHECK (
  (ecosystem = 'evm' AND address ~ '^0x[0-9a-f]{40}$') OR
  (ecosystem = 'solana' AND address ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'));
ALTER TABLE hash_talk.login_challenges ADD COLUMN ecosystem text NOT NULL DEFAULT 'evm'
  CHECK (ecosystem IN ('evm', 'solana'));
CREATE TABLE hash_talk.login_handoffs (
  browser_hash text PRIMARY KEY,
  ticket_hash text UNIQUE NOT NULL,
  ecosystem text NOT NULL CHECK (ecosystem IN ('evm', 'solana')),
  device_id uuid NOT NULL,
  expires_at timestamptz NOT NULL,
  address text,
  CHECK (address IS NULL OR
    (ecosystem = 'evm' AND address ~ '^0x[0-9a-f]{40}$') OR
    (ecosystem = 'solana' AND address ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'))
) WITH (autovacuum_vacuum_scale_factor = 0.05, autovacuum_vacuum_threshold = 20,
  autovacuum_analyze_scale_factor = 0.05, autovacuum_analyze_threshold = 20);
CREATE INDEX login_handoffs_expiry ON hash_talk.login_handoffs(expires_at);
ALTER TABLE hash_talk.login_challenges ADD COLUMN handoff_hash text;
-- References are checked atomically when accepting a signature. No cascade hides accepted state.
