-- Target-first lookup for opt-in public post/reply wakes; no historical fanout.
CREATE INDEX public_profile_notification_targets
ON hash_talk.public_profile_follows(target,follower) WHERE following AND notifications;
