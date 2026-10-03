-- Private address books remain opaque vault content. Only delivery permissions
-- and bounded abuse controls are represented here. No request text or photo.
CREATE TABLE hash_talk.contact_controls (
 account_id uuid PRIMARY KEY REFERENCES hash_talk.accounts(id) ON DELETE CASCADE,
 revision integer NOT NULL DEFAULT 0 CHECK(revision>=0),
 mode text NOT NULL DEFAULT 'invite' CHECK(mode IN ('wallet','invite','contacts')),
 invite_hash text UNIQUE CHECK(invite_hash ~ '^[a-f0-9]{64}$'),
 request_day date NOT NULL DEFAULT current_date,
 requests_today integer NOT NULL DEFAULT 0 CHECK(requests_today BETWEEN 0 AND 32)
);
CREATE TABLE hash_talk.contact_relations (
 lo uuid NOT NULL REFERENCES hash_talk.accounts(id) ON DELETE CASCADE,
 hi uuid NOT NULL REFERENCES hash_talk.accounts(id) ON DELETE CASCADE,
 requester uuid NOT NULL REFERENCES hash_talk.accounts(id),
 state text NOT NULL CHECK(state IN ('pending','approved','rejected')),
 PRIMARY KEY(lo,hi), CHECK(lo<hi), CHECK(requester IN (lo,hi))
) WITH (autovacuum_vacuum_scale_factor=0.05,autovacuum_vacuum_threshold=20,
 autovacuum_analyze_scale_factor=0.05,autovacuum_analyze_threshold=20);
CREATE INDEX contact_relations_hi ON hash_talk.contact_relations(hi);
CREATE INDEX contact_relations_requester ON hash_talk.contact_relations(requester) WHERE state='pending';
CREATE TABLE hash_talk.contact_blocks (
 account_id uuid NOT NULL REFERENCES hash_talk.accounts(id) ON DELETE CASCADE,
 wallet_hash text NOT NULL CHECK(wallet_hash ~ '^[a-f0-9]{64}$'),
 PRIMARY KEY(account_id,wallet_hash)
) WITH (autovacuum_vacuum_scale_factor=0.05,autovacuum_vacuum_threshold=20,
 autovacuum_analyze_scale_factor=0.05,autovacuum_analyze_threshold=20);
-- Operational controls use fixed cardinality budgets independent of content
-- quota, so a full vault cannot prevent blocking. No space is preallocated.
