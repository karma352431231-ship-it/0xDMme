-- Bound reaction admission to one original message without scanning a participant's history.
CREATE INDEX social_messages_reaction_target
ON hash_talk.social_messages ((body->'relation'->>'id'),sender)
WHERE body->'relation' IS NOT NULL;
