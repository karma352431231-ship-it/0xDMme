-- Accepted DMs cannot disappear through a public-profile/account cascade.
-- The future account-deletion flow must preserve the other participant's
-- accepted history and the authority needed to verify it, as in private chat.
ALTER TABLE hash_talk.social_messages DROP CONSTRAINT social_messages_sender_fkey;
ALTER TABLE hash_talk.social_messages DROP CONSTRAINT social_messages_recipient_fkey;
ALTER TABLE hash_talk.social_messages ADD CONSTRAINT social_messages_sender_fkey FOREIGN KEY(sender) REFERENCES hash_talk.public_profiles(id);
ALTER TABLE hash_talk.social_messages ADD CONSTRAINT social_messages_recipient_fkey FOREIGN KEY(recipient) REFERENCES hash_talk.public_profiles(id);
ALTER TABLE hash_talk.social_messages ADD COLUMN sender_revision integer GENERATED ALWAYS AS ((body->>'senderRevision')::integer) STORED;
ALTER TABLE hash_talk.social_messages ADD COLUMN recipient_revision integer GENERATED ALWAYS AS ((body->>'recipientRevision')::integer) STORED;
ALTER TABLE hash_talk.social_messages ADD CONSTRAINT social_message_sender_history FOREIGN KEY(sender,sender_revision) REFERENCES hash_talk.social_directories(profile_id,revision);
ALTER TABLE hash_talk.social_messages ADD CONSTRAINT social_message_recipient_history FOREIGN KEY(recipient,recipient_revision) REFERENCES hash_talk.social_directories(profile_id,revision);
