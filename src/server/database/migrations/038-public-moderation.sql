-- Decisions contain public IDs and hashes, never private DM content or wallet/device data.
-- Candidate bytes remain owned/charged by their original module until physical removal.
CREATE TABLE hash_talk.public_moderation (
  id uuid PRIMARY KEY,
  owner uuid NOT NULL,
  kind text NOT NULL CHECK(kind IN ('avatar','community-photo','post-media')),
  target uuid NOT NULL,
  content_hash text NOT NULL CHECK(content_hash ~ '^[a-f0-9]{64}$'),
  policy text NOT NULL CHECK(policy='0xdmme-public-explicit-v1'),
  status text NOT NULL DEFAULT 'pending' CHECK(status IN
    ('pending','analyzing','approved','rejected','held','failed','discarding','expired','removed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now()+interval '7 days',
  attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 3),
  next_attempt_at timestamptz,
  lease uuid,
  lease_until timestamptz,
  model_hash text CHECK(model_hash ~ '^[a-f0-9]{64}$'),
  runtime text CHECK(length(runtime) BETWEEN 1 AND 120),
  frames integer CHECK(frames BETWEEN 1 AND 60001),
  automatic_verdict text CHECK(automatic_verdict IN ('allow','reject','hold')),
  completed_lease uuid,
  appeal text CHECK(length(appeal) BETWEEN 1 AND 2000),
  decision text CHECK(length(decision) BETWEEN 1 AND 1000),
  operator_verdict text CHECK(operator_verdict IN ('allow','reject')),
  reviewed_at timestamptz,
  charge integer GENERATED ALWAYS AS
    (1024+coalesce(octet_length(appeal),0)+coalesce(octet_length(decision),0)) STORED,
  CHECK(expires_at=created_at+interval '7 days'),
  CHECK((lease IS NULL)=(lease_until IS NULL)),
  CHECK((status='analyzing')=(lease IS NOT NULL)),
  CHECK(status NOT IN ('approved','rejected','held') OR operator_verdict IS NOT NULL OR
    (model_hash IS NOT NULL AND runtime IS NOT NULL AND frames IS NOT NULL AND automatic_verdict IS NOT NULL)),
  CHECK((automatic_verdict IS NULL)=(completed_lease IS NULL)),
  CHECK((operator_verdict IS NULL)=(reviewed_at IS NULL)),
  CHECK(operator_verdict IS NULL OR (appeal IS NOT NULL AND decision IS NOT NULL))
) WITH (autovacuum_vacuum_scale_factor=0.05,autovacuum_vacuum_threshold=20,
  autovacuum_analyze_scale_factor=0.05,autovacuum_analyze_threshold=20);
CREATE INDEX public_moderation_queue ON hash_talk.public_moderation(created_at,id)
  WHERE status IN ('pending','failed');
CREATE INDEX public_moderation_lease ON hash_talk.public_moderation(lease_until,id)
  WHERE status='analyzing';
CREATE INDEX public_moderation_expiry ON hash_talk.public_moderation(expires_at,id)
  WHERE status NOT IN ('approved','expired','removed','discarding');
CREATE INDEX public_moderation_owner ON hash_talk.public_moderation(owner,created_at DESC,id DESC);
CREATE TRIGGER public_moderation_usage AFTER INSERT OR DELETE OR UPDATE OF appeal,decision
ON hash_talk.public_moderation FOR EACH ROW EXECUTE FUNCTION hash_talk.track_message_usage();
