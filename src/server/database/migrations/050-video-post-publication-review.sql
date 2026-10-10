-- Explicit owner decision of 10/10/2026: uploaded videos may be published while
-- their durable review runs. Existing reviews keep their earlier release rule.
ALTER TABLE hash_talk.public_moderation
  ADD COLUMN publication_phase text NOT NULL DEFAULT 'before'
    CHECK(publication_phase IN ('before','after')),
  ADD COLUMN warned_at timestamptz,
  ADD CONSTRAINT public_moderation_video_warning CHECK(
    (publication_phase='before' AND warned_at IS NULL) OR
    (publication_phase='after' AND kind='post-media')
  );
