-- Which wallet confirmed a session, so recovery asks that wallet for the
-- capsule it opens. Null for sessions linked by code and for sessions opened
-- before this column existed; those keep using the account's main wallet.
ALTER TABLE hash_talk.login_sessions
  ADD COLUMN wallet_ecosystem text CHECK (wallet_ecosystem IN ('evm', 'solana')),
  ADD COLUMN wallet_address text,
  ADD CONSTRAINT login_sessions_wallet CHECK ((wallet_ecosystem IS NULL) = (wallet_address IS NULL));
