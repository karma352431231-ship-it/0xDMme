-- Counts only records that exist, not account/group maximum allocations.
CREATE TABLE hash_talk.content_usage (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  used_bytes bigint NOT NULL CHECK(used_bytes>=0)
);
INSERT INTO hash_talk.content_usage(singleton,used_bytes)
SELECT true,coalesce((SELECT sum(charge) FROM hash_talk.vault_operations),0)
  +coalesce((SELECT sum(octet_length(profile_ciphertext)+524) FROM hash_talk.accounts),0);
CREATE FUNCTION hash_talk.track_content_usage() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE before_bytes bigint:=0; after_bytes bigint:=0;
BEGIN
  IF TG_TABLE_NAME='vault_operations' THEN
    IF TG_OP<>'INSERT' THEN before_bytes:=OLD.charge; END IF;
    IF TG_OP<>'DELETE' THEN after_bytes:=NEW.charge; END IF;
  ELSE
    IF TG_OP<>'INSERT' THEN before_bytes:=coalesce(octet_length(OLD.profile_ciphertext)+524,0); END IF;
    IF TG_OP<>'DELETE' THEN after_bytes:=coalesce(octet_length(NEW.profile_ciphertext)+524,0); END IF;
  END IF;
  IF before_bytes<>after_bytes THEN
    UPDATE hash_talk.content_usage SET used_bytes=used_bytes+after_bytes-before_bytes WHERE singleton;
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER track_vault_content AFTER INSERT OR DELETE OR UPDATE OF charge ON hash_talk.vault_operations
  FOR EACH ROW EXECUTE FUNCTION hash_talk.track_content_usage();
CREATE TRIGGER track_profile_content AFTER INSERT OR DELETE OR UPDATE OF profile_ciphertext ON hash_talk.accounts
  FOR EACH ROW EXECUTE FUNCTION hash_talk.track_content_usage();
