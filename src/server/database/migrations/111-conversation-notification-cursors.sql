-- Notification acknowledgement is independent of a verified message read.
ALTER TABLE hash_talk.conversation_controls
  ADD COLUMN notifications_through bigint NOT NULL DEFAULT 0 CHECK (notifications_through >= 0);
ALTER TABLE hash_talk.group_controls
  ADD COLUMN notifications_through bigint NOT NULL DEFAULT 0 CHECK (notifications_through >= 0);
