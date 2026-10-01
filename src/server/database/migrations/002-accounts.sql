CREATE TABLE hash_talk.account_capacity (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  reserved_bytes bigint NOT NULL DEFAULT 0 CHECK (reserved_bytes >= 0)
);
INSERT INTO hash_talk.account_capacity (singleton) VALUES (true);

CREATE TABLE hash_talk.accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  address text UNIQUE NOT NULL CHECK (address ~ '^0x[0-9a-f]{40}$'),
  display_name text NOT NULL DEFAULT '' CHECK (length(display_name) <= 80),
  reserved_bytes bigint NOT NULL DEFAULT 300000000 CHECK (reserved_bytes = 300000000),
  profile_revision integer NOT NULL DEFAULT 0 CHECK (profile_revision >= 0),
  profile_iv bytea,
  profile_ciphertext bytea,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((profile_revision = 0 AND profile_iv IS NULL AND profile_ciphertext IS NULL)
    OR (profile_revision > 0 AND octet_length(profile_iv) = 12
      AND octet_length(profile_ciphertext) BETWEEN 16 AND 3065536))
);
-- Pending registration is NOT an authorized E2EE recipient or a vault key.
CREATE TABLE hash_talk.login_devices (
  account_id uuid NOT NULL REFERENCES hash_talk.accounts(id),
  device_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, device_id)
);
CREATE TABLE hash_talk.login_challenges (
  id uuid PRIMARY KEY,
  browser_hash text UNIQUE NOT NULL,
  address text NOT NULL,
  device_id uuid NOT NULL,
  message text NOT NULL CHECK (length(message) <= 2048),
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 3)
) WITH (autovacuum_vacuum_scale_factor = 0.05, autovacuum_vacuum_threshold = 20,
  autovacuum_analyze_scale_factor = 0.05, autovacuum_analyze_threshold = 20);
CREATE INDEX login_challenges_expiry ON hash_talk.login_challenges(expires_at);
CREATE TABLE hash_talk.login_sessions (
  token_hash text PRIMARY KEY,
  csrf text NOT NULL,
  account_id uuid NOT NULL,
  device_id uuid NOT NULL,
  expires_at timestamptz NOT NULL,
  FOREIGN KEY (account_id, device_id) REFERENCES hash_talk.login_devices(account_id, device_id)
) WITH (autovacuum_vacuum_scale_factor = 0.05, autovacuum_vacuum_threshold = 20,
  autovacuum_analyze_scale_factor = 0.05, autovacuum_analyze_threshold = 20);
CREATE INDEX login_sessions_expiry ON hash_talk.login_sessions(expires_at);
CREATE INDEX login_sessions_account ON hash_talk.login_sessions(account_id);
