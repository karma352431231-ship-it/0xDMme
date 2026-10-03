-- Profile cards use the same authenticated Olm/Megolm transport and recoverable history.
ALTER TABLE hash_talk.message_packets ADD COLUMN kind text NOT NULL DEFAULT 'text' CHECK(kind IN ('text','profile'));
