-- Owner, 25/10/2026: communities created before the English defaults receive
-- the eight newer default tags. A label a community already has (any case,
-- active or retired) is kept as it is, so managers' own tags are never
-- duplicated, renamed or reactivated. Archived communities have no manager
-- and are left unchanged. Each new row is charged by the existing statement
-- trigger like any manager-created tag.
INSERT INTO hash_talk.community_tags(id,community_id,label)
SELECT gen_random_uuid(),c.id,d.label
  FROM hash_talk.communities c
  CROSS JOIN (VALUES ('Question'),('News'),('Analysis'),('Alpha'),('Help'),
    ('Announcement'),('Showcase'),('Event')) AS d(label)
  WHERE NOT c.archived
ON CONFLICT (community_id,lower(label)) DO NOTHING;
