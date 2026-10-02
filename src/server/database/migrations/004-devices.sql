-- Device authority is distinct from wallet login. Only opaque envelopes and
-- authenticated public directory events are persisted here.
CREATE TABLE hash_talk.device_directories (
  account_id uuid PRIMARY KEY REFERENCES hash_talk.accounts(id),
  revision integer NOT NULL CHECK (revision BETWEEN 1 AND 128),
  head text NOT NULL CHECK (head ~ '^[a-f0-9]{64}$'),
  event jsonb NOT NULL CHECK (octet_length(event::text) <= 70000)
);
CREATE TABLE hash_talk.device_events (
  account_id uuid NOT NULL REFERENCES hash_talk.accounts(id),
  revision integer NOT NULL CHECK (revision BETWEEN 1 AND 128),
  event jsonb NOT NULL CHECK (octet_length(event::text) <= 70000),
  PRIMARY KEY (account_id, revision)
);
CREATE TABLE hash_talk.device_links (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL,
  device_id uuid NOT NULL,
  code_hash text UNIQUE NOT NULL CHECK (code_hash ~ '^[a-f0-9]{64}$'),
  device jsonb NOT NULL CHECK (octet_length(device::text) <= 2048),
  expires_at timestamptz NOT NULL,
  FOREIGN KEY (account_id, device_id) REFERENCES hash_talk.login_devices(account_id, device_id)
) WITH (autovacuum_vacuum_scale_factor = 0.05, autovacuum_vacuum_threshold = 20,
  autovacuum_analyze_scale_factor = 0.05, autovacuum_analyze_threshold = 20);
CREATE INDEX device_links_expiry ON hash_talk.device_links(expires_at);
CREATE INDEX device_links_account ON hash_talk.device_links(account_id);
