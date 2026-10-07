ALTER TABLE hash_talk.communities ADD COLUMN pending_review uuid
  REFERENCES hash_talk.public_moderation(id) ON DELETE SET NULL;
-- Legacy photos have neither an upload timestamp nor an uploader record. Notify
-- the current owner and collect them without granting a fresh retention window.
INSERT INTO hash_talk.public_moderation
  (id,owner,kind,target,content_hash,policy,status,created_at,expires_at)
SELECT gen_random_uuid(),owner,'community-photo',id,encode(sha256(pending_photo),'hex'),
  '0xdmme-public-explicit-v1','discarding',now()-interval '7 days',now()
FROM hash_talk.communities WHERE pending_photo IS NOT NULL AND owner IS NOT NULL;
UPDATE hash_talk.communities c SET pending_review=r.id
FROM hash_talk.public_moderation r WHERE r.kind='community-photo' AND r.target=c.id
  AND r.status='discarding' AND c.pending_photo IS NOT NULL;
-- An orphan community has no author who can receive or contest this candidate.
UPDATE hash_talk.communities SET pending_photo=NULL,pending_photo_type=NULL,revision=revision+1
WHERE pending_photo IS NOT NULL AND owner IS NULL;
