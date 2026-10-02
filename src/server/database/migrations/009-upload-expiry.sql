-- Only unaccepted upload reservations expire. Confirmed versions have no TTL.
ALTER TABLE hash_talk.vault_operations ADD COLUMN reserved_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX vault_reservations_expiry ON hash_talk.vault_operations(reserved_at) WHERE state='reserved';
