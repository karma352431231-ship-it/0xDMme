-- Prepared short coordination for transaction-owned physical credits. Runtime
-- writers retain their existing guard until the complete protocol is connected.
CREATE TABLE hash_talk.content_allocation_guard (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton)
);
INSERT INTO hash_talk.content_allocation_guard VALUES(true);

-- A top-level xid8 identifies one concrete operation, never an account quota.
-- No wall-clock expiry: a live writer must not lose its granted credits.
CREATE TABLE hash_talk.content_allocations (
  transaction_id xid8 PRIMARY KEY,
  bytes bigint NOT NULL CHECK(bytes BETWEEN 1 AND 9007199254740991)
) WITH (autovacuum_vacuum_scale_factor=0.05,autovacuum_vacuum_threshold=20,
  autovacuum_analyze_scale_factor=0.05,autovacuum_analyze_threshold=20);
