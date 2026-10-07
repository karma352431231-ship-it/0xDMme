ALTER TABLE hash_talk.public_profiles ADD COLUMN pending_review uuid
  REFERENCES hash_talk.public_moderation(id) ON DELETE SET NULL;
-- Existing candidates have no upload timestamp. Do not invent a fresh seven-day
-- retention window: keep an author notice and schedule their bytes for collection.
INSERT INTO hash_talk.public_moderation
  (id,owner,kind,target,content_hash,policy,status,created_at,expires_at)
SELECT gen_random_uuid(),id,'avatar',id,encode(sha256(pending_avatar),'hex'),
  '0xdmme-public-explicit-v1','discarding',now()-interval '7 days',now()
FROM hash_talk.public_profiles WHERE pending_avatar IS NOT NULL;
UPDATE hash_talk.public_profiles p SET pending_review=r.id
FROM hash_talk.public_moderation r WHERE r.kind='avatar' AND r.target=p.id
  AND r.status='discarding' AND p.pending_avatar IS NOT NULL;
