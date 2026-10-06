CREATE TABLE hash_talk.communities (
  id uuid PRIMARY KEY,
  owner uuid REFERENCES hash_talk.public_profiles(id) ON DELETE SET NULL,
  name text NOT NULL CHECK(length(name) BETWEEN 1 AND 100),
  description text NOT NULL CHECK(length(description)<=1000),
  rules text NOT NULL CHECK(length(rules)<=4000),
  revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
  archived boolean NOT NULL DEFAULT false,
  transfer_id uuid,
  transfer_to uuid REFERENCES hash_talk.public_profiles(id) ON DELETE SET NULL,
  pending_photo bytea CHECK(octet_length(pending_photo) BETWEEN 1 AND 3000000),
  pending_photo_type text CHECK(pending_photo_type IN ('image/png','image/jpeg')),
  charge integer GENERATED ALWAYS AS (1024+octet_length(name)+octet_length(description)+octet_length(rules)+coalesce(octet_length(pending_photo),0)) STORED,
  CHECK(owner IS NOT NULL OR archived),
  CHECK((transfer_id IS NULL)=(transfer_to IS NULL)),
  CHECK((pending_photo IS NULL)=(pending_photo_type IS NULL))
) WITH (autovacuum_vacuum_scale_factor=0.05,autovacuum_vacuum_threshold=20,autovacuum_analyze_scale_factor=0.05,autovacuum_analyze_threshold=20);
CREATE INDEX community_owner ON hash_talk.communities(owner,id);
CREATE INDEX community_transfer ON hash_talk.communities(transfer_to,id);
CREATE TABLE hash_talk.community_follows (
  community_id uuid NOT NULL REFERENCES hash_talk.communities(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES hash_talk.public_profiles(id) ON DELETE CASCADE,
  charge integer NOT NULL DEFAULT 128 CHECK(charge=128),
  PRIMARY KEY(community_id,profile_id)
);
CREATE INDEX community_followed ON hash_talk.community_follows(profile_id,community_id);
CREATE TABLE hash_talk.community_moderators (
  community_id uuid NOT NULL REFERENCES hash_talk.communities(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES hash_talk.public_profiles(id) ON DELETE CASCADE,
  charge integer NOT NULL DEFAULT 128 CHECK(charge=128),
  PRIMARY KEY(community_id,profile_id)
);
CREATE INDEX community_moderated ON hash_talk.community_moderators(profile_id,community_id);
-- Historical public IDs are not reassigned when a handle is reused. No wallet/device/proof is stored here.
CREATE TABLE hash_talk.community_sanctions (
  id uuid PRIMARY KEY,
  community_id uuid NOT NULL REFERENCES hash_talk.communities(id) ON DELETE CASCADE,
  target uuid NOT NULL,
  actor uuid NOT NULL,
  reason text NOT NULL CHECK(length(reason) BETWEEN 1 AND 1000),
  days integer CHECK(days IN (1,7,30)),
  until_at timestamptz,
  lifted boolean NOT NULL DEFAULT false,
  appeal text CHECK(length(appeal) BETWEEN 1 AND 2000),
  decision text CHECK(length(decision) BETWEEN 1 AND 1000),
  charge integer GENERATED ALWAYS AS (512+octet_length(reason)+coalesce(octet_length(appeal),0)+coalesce(octet_length(decision),0)) STORED,
  CHECK((days IS NULL)=(until_at IS NULL))
) WITH (autovacuum_vacuum_scale_factor=0.05,autovacuum_vacuum_threshold=20,autovacuum_analyze_scale_factor=0.05,autovacuum_analyze_threshold=20);
CREATE INDEX community_sanction_target ON hash_talk.community_sanctions(community_id,target) WHERE NOT lifted;
CREATE INDEX community_sanction_page ON hash_talk.community_sanctions(community_id,id);
CREATE TABLE hash_talk.community_reports (
  id uuid PRIMARY KEY,
  community_id uuid NOT NULL REFERENCES hash_talk.communities(id) ON DELETE CASCADE,
  author uuid NOT NULL,
  reason text NOT NULL CHECK(length(reason) BETWEEN 1 AND 1000),
  resolved boolean NOT NULL DEFAULT false,
  decision text CHECK(length(decision) BETWEEN 1 AND 1000),
  charge integer GENERATED ALWAYS AS (384+octet_length(reason)+coalesce(octet_length(decision),0)) STORED
) WITH (autovacuum_vacuum_scale_factor=0.05,autovacuum_vacuum_threshold=20,autovacuum_analyze_scale_factor=0.05,autovacuum_analyze_threshold=20);
CREATE UNIQUE INDEX community_report_open ON hash_talk.community_reports(community_id,author) WHERE NOT resolved;
CREATE INDEX community_report_page ON hash_talk.community_reports(community_id,id);
CREATE INDEX community_report_author ON hash_talk.community_reports(author,community_id,id);
CREATE FUNCTION hash_talk.archive_owned_communities() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE hash_talk.communities SET archived=true,transfer_id=NULL,transfer_to=NULL,revision=revision+1 WHERE owner=OLD.id;
  UPDATE hash_talk.communities SET transfer_id=NULL,transfer_to=NULL,revision=revision+1 WHERE transfer_to=OLD.id;
  RETURN OLD;
END;
$$;
CREATE TRIGGER community_owner_deleted BEFORE DELETE ON hash_talk.public_profiles FOR EACH ROW EXECUTE FUNCTION hash_talk.archive_owned_communities();
CREATE TRIGGER community_usage AFTER INSERT OR DELETE OR UPDATE ON hash_talk.communities FOR EACH ROW EXECUTE FUNCTION hash_talk.track_message_usage();
CREATE TRIGGER community_follow_usage AFTER INSERT OR DELETE ON hash_talk.community_follows FOR EACH ROW EXECUTE FUNCTION hash_talk.track_message_usage();
CREATE TRIGGER community_moderator_usage AFTER INSERT OR DELETE ON hash_talk.community_moderators FOR EACH ROW EXECUTE FUNCTION hash_talk.track_message_usage();
CREATE TRIGGER community_sanction_usage AFTER INSERT OR DELETE OR UPDATE ON hash_talk.community_sanctions FOR EACH ROW EXECUTE FUNCTION hash_talk.track_message_usage();
CREATE TRIGGER community_report_usage AFTER INSERT OR DELETE OR UPDATE ON hash_talk.community_reports FOR EACH ROW EXECUTE FUNCTION hash_talk.track_message_usage();
