-- Preserve historical rules/decisions. New admissions use v2; active candidates
-- are retargeted by the owning modules without extending their original deadline.
ALTER TABLE hash_talk.public_moderation DROP CONSTRAINT public_moderation_policy_check;
ALTER TABLE hash_talk.public_moderation ADD CONSTRAINT public_moderation_policy_check
  CHECK(policy IN ('0xdmme-public-explicit-v1','0xdmme-public-explicit-v2'));
