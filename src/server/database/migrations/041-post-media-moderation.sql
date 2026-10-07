ALTER TABLE hash_talk.community_media
  ADD COLUMN created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN result_hash text CHECK(result_hash ~ '^[a-f0-9]{64}$'),
  ADD COLUMN thumbnail_hash text CHECK(thumbnail_hash ~ '^[a-f0-9]{64}$'),
  ADD COLUMN moderation_review uuid REFERENCES hash_talk.public_moderation(id) ON DELETE SET NULL,
  ADD CONSTRAINT community_media_hash_pair CHECK((result_hash IS NULL)=(thumbnail_hash IS NULL));
-- The existing temporary deadline is never renewed; it records reservation +24h.
UPDATE hash_talk.community_media SET created_at=expires_at-interval '24 hours';
-- Legacy prepared files lack hashes of the result/thumbnail. They cannot reuse an
-- analysis of the original upload. Retain an author notice and collect the bytes.
INSERT INTO hash_talk.public_moderation
  (id,owner,kind,target,content_hash,policy,status,created_at,expires_at)
SELECT gen_random_uuid(),author,'post-media',id,source->>'hash',
  '0xdmme-public-explicit-v1','discarding',now()-interval '7 days',now()
FROM hash_talk.community_media WHERE status IN ('ready','attached') AND author IS NOT NULL;
UPDATE hash_talk.community_media m SET moderation_review=r.id
FROM hash_talk.public_moderation r WHERE r.kind='post-media' AND r.target=m.id
  AND r.status='discarding' AND m.status IN ('ready','attached');
UPDATE hash_talk.community_media SET status='deleting',post_id=NULL
WHERE status IN ('ready','attached') AND author IS NULL;
CREATE INDEX public_moderation_target ON hash_talk.public_moderation(kind,target);
