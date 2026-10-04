-- Existing sessions were all created by verified wallet login.
ALTER TABLE hash_talk.login_sessions ADD COLUMN wallet_confirmed boolean NOT NULL DEFAULT true;
