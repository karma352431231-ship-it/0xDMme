-- Only hashes/operational identifiers. Names, scopes and representative identities stay E2EE.
CREATE TABLE hash_talk.organizations (
  id uuid PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES hash_talk.accounts(id) ON DELETE CASCADE,
  registration jsonb NOT NULL CHECK(octet_length(registration::text)<=1500),
  descriptor_hash text NOT NULL CHECK(descriptor_hash ~ '^[a-f0-9]{64}$'),
  charge integer NOT NULL DEFAULT 2048 CHECK(charge=2048)
);
CREATE INDEX organizations_owner ON hash_talk.organizations(account_id,id);
CREATE TABLE hash_talk.representative_credentials (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES hash_talk.organizations(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES hash_talk.accounts(id) ON DELETE CASCADE,
  hash text NOT NULL CHECK(hash ~ '^[a-f0-9]{64}$'),
  issued_at bigint NOT NULL,
  expires_at bigint NOT NULL CHECK(expires_at>issued_at),
  revocation jsonb CHECK(octet_length(revocation::text)<=1024),
  charge integer NOT NULL DEFAULT 1536 CHECK(charge=1536)
);
CREATE INDEX representative_organization ON hash_talk.representative_credentials(organization_id,id);
CREATE TABLE hash_talk.organization_domains (
  organization_id uuid PRIMARY KEY REFERENCES hash_talk.organizations(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES hash_talk.accounts(id) ON DELETE CASCADE,
  claim jsonb NOT NULL CHECK(octet_length(claim::text)<=1024),
  record text NOT NULL CHECK(record ~ '^0xdmme-verification=[a-f0-9]{64}$'),
  verified_at bigint,
  verified_once boolean NOT NULL DEFAULT false,
  checked_at bigint NOT NULL DEFAULT 0,
  charge integer NOT NULL DEFAULT 2048 CHECK(charge=2048)
) WITH (autovacuum_vacuum_scale_factor=0.05,autovacuum_vacuum_threshold=20,
autovacuum_analyze_scale_factor=0.05,autovacuum_analyze_threshold=20);
CREATE INDEX domain_recheck ON hash_talk.organization_domains(checked_at);
CREATE TRIGGER organization_usage AFTER INSERT OR DELETE ON hash_talk.organizations FOR EACH ROW EXECUTE FUNCTION hash_talk.track_message_usage();
CREATE TRIGGER representative_usage AFTER INSERT OR DELETE ON hash_talk.representative_credentials FOR EACH ROW EXECUTE FUNCTION hash_talk.track_message_usage();
CREATE TRIGGER domain_usage AFTER INSERT OR DELETE ON hash_talk.organization_domains FOR EACH ROW EXECUTE FUNCTION hash_talk.track_message_usage();
