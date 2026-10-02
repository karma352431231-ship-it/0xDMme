-- Immutable encrypted operations; reservations count before object upload.
CREATE TABLE hash_talk.vault_heads (
  account_id uuid PRIMARY KEY REFERENCES hash_talk.accounts(id),
  sequence integer NOT NULL DEFAULT 0 CHECK (sequence BETWEEN 0 AND 100000),
  head text CHECK (head ~ '^[a-f0-9]{64}$')
);
CREATE TABLE hash_talk.vault_operations (
  account_id uuid NOT NULL REFERENCES hash_talk.accounts(id),
  id uuid NOT NULL,
  hash text NOT NULL CHECK (hash ~ '^[a-f0-9]{64}$'),
  object_hash text UNIQUE NOT NULL CHECK (object_hash ~ '^[a-f0-9]{64}$'),
  commit jsonb NOT NULL CHECK (octet_length(commit::text) <= 10000),
  charge integer NOT NULL CHECK (charge BETWEEN 4125 AND 3010000),
  state text NOT NULL CHECK (state IN ('reserved','writing','accepted','discarding')),
  writer uuid,
  sequence integer,
  PRIMARY KEY(account_id,id),
  UNIQUE(account_id,sequence),
  CHECK ((state='accepted' AND sequence IS NOT NULL) OR (state<>'accepted' AND sequence IS NULL))
) WITH (autovacuum_vacuum_scale_factor=0.05, autovacuum_vacuum_threshold=20,
  autovacuum_analyze_scale_factor=0.05, autovacuum_analyze_threshold=20);
CREATE INDEX vault_operations_pending ON hash_talk.vault_operations(account_id) WHERE state<>'accepted';
