-- Stable service identity only. Account/message schemas belong to later blocks.
-- PostgreSQL durability and autovacuum remain enabled; no cluster-wide changes.
CREATE TABLE hash_talk.service_metadata (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  installation_id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO hash_talk.service_metadata (singleton) VALUES (true);
