-- A recipient can share a read only after this device has received the encrypted packet.
-- NULL and all historical receipts mean no shared read. Epoch revocation uses existing account privacy.
ALTER TABLE hash_talk.social_receipts ADD COLUMN read_epoch integer CHECK(read_epoch>=0);
