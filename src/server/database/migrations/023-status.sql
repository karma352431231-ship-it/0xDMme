-- Ephemeral publications are intentionally absent from backup windows/targets.
CREATE TABLE hash_talk.status_posts (
  id uuid PRIMARY KEY,
  author uuid NOT NULL REFERENCES hash_talk.accounts(id),
  device_id uuid NOT NULL,
  directory text NOT NULL CHECK(directory ~ '^[a-f0-9]{64}$'),
  contact_revision integer NOT NULL CHECK(contact_revision>0),
  content_hash text CHECK(content_hash ~ '^[a-f0-9]{64}$'),
  audience_head text CHECK(audience_head ~ '^[a-f0-9]{64}$'),
  pages integer NOT NULL DEFAULT 0 CHECK(pages>=0),
  audience_count integer NOT NULL DEFAULT 0 CHECK(audience_count>=0),
  notice_pending boolean NOT NULL DEFAULT false,
  notice_after uuid,
  body jsonb CHECK(octet_length(body::text)<=4300000),
  hash text CHECK(hash ~ '^[a-f0-9]{64}$'),
  state text NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','published','deleting')),
  published_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  charge integer NOT NULL DEFAULT 512 CHECK(charge BETWEEN 512 AND 4400000),
  CHECK((state='published')=(body IS NOT NULL)),
  CHECK((published_at IS NULL)=(expires_at IS NULL))
) WITH (autovacuum_vacuum_scale_factor=0.05,autovacuum_vacuum_threshold=20,
  autovacuum_analyze_scale_factor=0.05,autovacuum_analyze_threshold=20);
CREATE INDEX status_author ON hash_talk.status_posts(author,id);
CREATE INDEX status_active ON hash_talk.status_posts(expires_at,id) WHERE state='published';
CREATE TABLE hash_talk.status_recipients (
  status_id uuid NOT NULL REFERENCES hash_talk.status_posts(id),
  account_id uuid NOT NULL REFERENCES hash_talk.accounts(id),
  author uuid NOT NULL REFERENCES hash_talk.accounts(id),
  envelope jsonb NOT NULL CHECK(octet_length(envelope::text)<=16384),
  hash text NOT NULL CHECK(hash ~ '^[a-f0-9]{64}$'),
  charge integer NOT NULL CHECK(charge BETWEEN 512 AND 32768),
  PRIMARY KEY(status_id,account_id)
) WITH (autovacuum_vacuum_scale_factor=0.05,autovacuum_vacuum_threshold=20,
  autovacuum_analyze_scale_factor=0.05,autovacuum_analyze_threshold=20);
CREATE INDEX status_recipient_feed ON hash_talk.status_recipients(account_id,status_id);
CREATE INDEX status_recipient_charge ON hash_talk.status_recipients(author);
CREATE TABLE hash_talk.status_pages (
  status_id uuid NOT NULL REFERENCES hash_talk.status_posts(id),
  page integer NOT NULL CHECK(page>0),
  author uuid NOT NULL REFERENCES hash_talk.accounts(id),
  previous text CHECK(previous ~ '^[a-f0-9]{64}$'),
  head text NOT NULL CHECK(head ~ '^[a-f0-9]{64}$'),
  hash text NOT NULL CHECK(hash ~ '^[a-f0-9]{64}$'),
  count integer NOT NULL CHECK(count BETWEEN 1 AND 16),
  charge integer NOT NULL DEFAULT 512 CHECK(charge=512),
  PRIMARY KEY(status_id,page)
);
CREATE INDEX status_page_charge ON hash_talk.status_pages(author);
CREATE TABLE hash_talk.status_media (
  id uuid PRIMARY KEY,
  status_id uuid NOT NULL REFERENCES hash_talk.status_posts(id),
  author uuid NOT NULL REFERENCES hash_talk.accounts(id),
  descriptor jsonb NOT NULL CHECK(octet_length(descriptor::text)<4096),
  bytes integer NOT NULL CHECK(bytes BETWEEN 1 AND 3000000),
  status text NOT NULL DEFAULT 'reserved' CHECK(status IN ('reserved','writing','ready','accepted','deleting')),
  received integer[] NOT NULL DEFAULT '{}',
  writer uuid,
  charge integer NOT NULL CHECK(charge>=bytes+512),
  CHECK((status='writing')=(writer IS NOT NULL)),
  CHECK(cardinality(received)<=12)
) WITH (autovacuum_vacuum_scale_factor=0.05,autovacuum_vacuum_threshold=20,
  autovacuum_analyze_scale_factor=0.05,autovacuum_analyze_threshold=20);
CREATE INDEX status_media_post ON hash_talk.status_media(status_id);
CREATE INDEX status_media_charge ON hash_talk.status_media(author);
CREATE TRIGGER status_post_usage AFTER INSERT OR DELETE OR UPDATE OF charge ON hash_talk.status_posts FOR EACH ROW EXECUTE FUNCTION hash_talk.track_message_usage();
CREATE TRIGGER status_recipient_usage AFTER INSERT OR DELETE ON hash_talk.status_recipients FOR EACH ROW EXECUTE FUNCTION hash_talk.track_message_usage();
CREATE TRIGGER status_page_usage AFTER INSERT OR DELETE ON hash_talk.status_pages FOR EACH ROW EXECUTE FUNCTION hash_talk.track_message_usage();
CREATE TRIGGER status_media_usage AFTER INSERT OR DELETE OR UPDATE OF charge ON hash_talk.status_media FOR EACH ROW EXECUTE FUNCTION hash_talk.track_message_usage();
