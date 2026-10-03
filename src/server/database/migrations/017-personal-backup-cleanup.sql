-- Explicit personal cleanup is distinct from bilateral deletion and from an ACK.
CREATE TABLE hash_talk.personal_removals (
  account_id uuid NOT NULL REFERENCES hash_talk.accounts(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK(kind IN ('vault','message')),
  id uuid NOT NULL,
  hash text NOT NULL CHECK(hash ~ '^[a-f0-9]{64}$'),
  sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE CHECK(sequence<=9007199254740991),
  proof jsonb NOT NULL CHECK(octet_length(proof::text)<=4096),
  retained_bytes integer NOT NULL DEFAULT 0 CHECK(retained_bytes>=0),
  charge integer NOT NULL CHECK(charge>=retained_bytes),
  PRIMARY KEY(account_id,kind,id)
) WITH (autovacuum_vacuum_scale_factor=0.05,autovacuum_vacuum_threshold=20,
  autovacuum_analyze_scale_factor=0.05,autovacuum_analyze_threshold=20);
CREATE INDEX personal_removals_page ON hash_talk.personal_removals(account_id,sequence);
CREATE TRIGGER track_personal_removal_content AFTER INSERT OR DELETE OR UPDATE OF charge
  ON hash_talk.personal_removals FOR EACH ROW EXECUTE FUNCTION hash_talk.track_message_usage();
ALTER TABLE hash_talk.vault_operations DROP CONSTRAINT vault_operations_charge_check;
ALTER TABLE hash_talk.vault_operations ADD CHECK(charge BETWEEN 0 AND 3010000);
ALTER TABLE hash_talk.message_packets ADD COLUMN personal_collected boolean NOT NULL DEFAULT false;
-- Find the original body/deletion invariant by definition, independent of generated name.
DO $$
DECLARE item record;
BEGIN
  FOR item IN SELECT conname FROM pg_constraint WHERE conrelid='hash_talk.message_packets'::regclass
    AND contype='c' AND pg_get_constraintdef(oid) LIKE '%body IS NULL%deletion IS NOT NULL%'
  LOOP EXECUTE format('ALTER TABLE hash_talk.message_packets DROP CONSTRAINT %I',item.conname); END LOOP;
END;
$$;
ALTER TABLE hash_talk.message_packets ADD CHECK((body IS NULL)=(deletion IS NOT NULL OR personal_collected));
