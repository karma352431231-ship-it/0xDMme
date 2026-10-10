-- Support distinct conversations with an eligible reply by another public profile.
-- Keep migration 051 immutable after its local test application.
CREATE INDEX public_profile_conversation_replies ON hash_talk.community_posts(root_id,author)
  WHERE root_id IS NOT NULL AND NOT deleted AND active_removal IS NULL;
