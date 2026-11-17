-- Extra sign-in wallets. The primary wallet stays in accounts; an address
-- signs in to one account only, which the store enforces across both tables
-- under the same per-wallet lock that account creation takes.
CREATE TABLE hash_talk.account_wallets (
  account_id uuid NOT NULL REFERENCES hash_talk.accounts(id) ON DELETE CASCADE,
  ecosystem text NOT NULL CHECK (ecosystem IN ('evm', 'solana')),
  address text NOT NULL,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ecosystem, address),
  CHECK (
    (ecosystem = 'evm' AND address ~ '^0x[0-9a-f]{40}$') OR
    (ecosystem = 'solana' AND address ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'))
);
CREATE INDEX account_wallets_account ON hash_talk.account_wallets(account_id);
