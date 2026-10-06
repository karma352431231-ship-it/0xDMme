-- Each participant removes only their logical personal copy. Accepted history
-- and media have no automatic expiry; temporary reservations follow the existing 24h policy.
ALTER TABLE hash_talk.social_messages ADD COLUMN sender_charge integer NOT NULL DEFAULT 0 CHECK(sender_charge>=0);
ALTER TABLE hash_talk.social_messages ADD COLUMN recipient_charge integer NOT NULL DEFAULT 0 CHECK(recipient_charge>=0);
UPDATE hash_talk.social_messages SET sender_charge=personal_charge,recipient_charge=personal_charge;
ALTER TABLE hash_talk.social_messages DROP COLUMN personal_charge;
ALTER TABLE hash_talk.social_messages ALTER COLUMN body DROP NOT NULL;
ALTER TABLE hash_talk.social_messages ADD COLUMN personal_collected boolean NOT NULL DEFAULT false;
ALTER TABLE hash_talk.social_messages ADD CHECK((body IS NULL)=personal_collected);
ALTER TABLE hash_talk.personal_removals DROP CONSTRAINT personal_removals_kind_check;
ALTER TABLE hash_talk.personal_removals ADD CHECK(kind IN ('vault','message','dm-message'));
CREATE TABLE hash_talk.social_personal_secrets (
  profile_id uuid PRIMARY KEY REFERENCES hash_talk.public_profiles(id) ON DELETE CASCADE,
  body jsonb NOT NULL CHECK(octet_length(body::text)<=4096),
  charge integer NOT NULL CHECK(charge>0)
);
CREATE TRIGGER social_secret_usage AFTER INSERT OR DELETE OR UPDATE OF charge ON hash_talk.social_personal_secrets FOR EACH ROW EXECUTE FUNCTION hash_talk.track_message_usage();
CREATE TABLE hash_talk.social_media (
  id uuid PRIMARY KEY,
  message_id uuid NOT NULL,
  sender uuid NOT NULL REFERENCES hash_talk.public_profiles(id),
  recipient uuid NOT NULL REFERENCES hash_talk.public_profiles(id),
  descriptor jsonb NOT NULL CHECK(octet_length(descriptor::text)<=8192),
  media text NOT NULL CHECK(media IN ('photo','gif','voice')),
  status text NOT NULL DEFAULT 'reserved' CHECK(status IN ('reserved','writing','ready','accepted','deleting')),
  received integer[] NOT NULL DEFAULT '{}',
  writer uuid,
  reserved_at timestamptz NOT NULL DEFAULT now(),
  lease_at timestamptz,
  bytes integer NOT NULL CHECK(bytes BETWEEN 1 AND 3000000),
  sender_charge integer NOT NULL CHECK(sender_charge>=0),
  recipient_charge integer NOT NULL CHECK(recipient_charge>=0),
  charge integer NOT NULL CHECK(charge>0),
  CHECK(sender<>recipient),CHECK((writer IS NOT NULL)=(status='writing'))
) WITH (autovacuum_vacuum_scale_factor=0.05,autovacuum_vacuum_threshold=20,autovacuum_analyze_scale_factor=0.05,autovacuum_analyze_threshold=20);
CREATE INDEX social_media_message ON hash_talk.social_media(message_id);
CREATE INDEX social_media_pending ON hash_talk.social_media(reserved_at,id) WHERE status IN ('reserved','writing','ready','deleting');
CREATE TRIGGER social_media_usage AFTER INSERT OR DELETE OR UPDATE OF charge ON hash_talk.social_media FOR EACH ROW EXECUTE FUNCTION hash_talk.track_message_usage();
CREATE TABLE hash_talk.social_receipts (
  message_id uuid NOT NULL REFERENCES hash_talk.social_messages(id),
  profile_id uuid NOT NULL REFERENCES hash_talk.public_profiles(id),
  device_id uuid NOT NULL,
  received boolean NOT NULL DEFAULT false,
  charge integer NOT NULL DEFAULT 256 CHECK(charge=256),
  PRIMARY KEY(message_id,profile_id,device_id)
);
CREATE TRIGGER social_receipt_usage AFTER INSERT OR DELETE OR UPDATE OF charge ON hash_talk.social_receipts FOR EACH ROW EXECUTE FUNCTION hash_talk.track_message_usage();
