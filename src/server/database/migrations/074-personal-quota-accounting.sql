-- Materialize the directly owned portions of the existing personal quota.
-- Attachment visibility depends on personal removals and remains a separate sum.
LOCK TABLE hash_talk.accounts, hash_talk.public_profiles,
  hash_talk.vault_operations, hash_talk.organizations,
  hash_talk.representative_credentials, hash_talk.organization_domains,
  hash_talk.daily_controls, hash_talk.message_reads, hash_talk.conversation_controls,
  hash_talk.device_presence, hash_talk.push_subscriptions, hash_talk.push_controls,
  hash_talk.call_controls, hash_talk.personal_removals,
  hash_talk.message_recovery_keys, hash_talk.message_packets,
  hash_talk.matrix_devices, hash_talk.matrix_one_time_keys, hash_talk.matrix_envelopes,
  hash_talk.group_controls, hash_talk.group_reads, hash_talk.status_posts,
  hash_talk.status_recipients, hash_talk.status_pages, hash_talk.status_media,
  hash_talk.social_directories, hash_talk.social_recovery,
  hash_talk.social_matrix_devices, hash_talk.social_matrix_keys,
  hash_talk.social_matrix_envelopes, hash_talk.social_personal_secrets,
  hash_talk.social_media, hash_talk.social_messages IN SHARE ROW EXCLUSIVE MODE;

CREATE TABLE hash_talk.account_quota_usage (
  account_id uuid PRIMARY KEY REFERENCES hash_talk.accounts(id) ON DELETE CASCADE,
  used_bytes bigint NOT NULL CHECK(used_bytes>=0)
) WITH (autovacuum_vacuum_scale_factor=0.05,autovacuum_vacuum_threshold=20,
  autovacuum_analyze_scale_factor=0.05,autovacuum_analyze_threshold=20);
CREATE TABLE hash_talk.profile_quota_usage (
  profile_id uuid PRIMARY KEY REFERENCES hash_talk.public_profiles(id) ON DELETE CASCADE,
  used_bytes bigint NOT NULL CHECK(used_bytes>=0)
) WITH (autovacuum_vacuum_scale_factor=0.05,autovacuum_vacuum_threshold=20,
  autovacuum_analyze_scale_factor=0.05,autovacuum_analyze_threshold=20);

-- Reference views are for backfill/reconciliation, never online quota admission.
CREATE VIEW hash_talk.account_quota_totals AS
SELECT account_id,sum(bytes)::bigint AS used_bytes FROM (
  SELECT id AS account_id,coalesce(octet_length(profile_ciphertext)+524,0)::bigint AS bytes FROM hash_talk.accounts
  UNION ALL SELECT account_id,charge FROM hash_talk.vault_operations
  UNION ALL SELECT account_id,charge FROM hash_talk.organizations
  UNION ALL SELECT account_id,charge FROM hash_talk.representative_credentials
  UNION ALL SELECT account_id,charge FROM hash_talk.organization_domains
  UNION ALL SELECT account_id,charge FROM hash_talk.daily_controls
  UNION ALL SELECT account_id,charge FROM hash_talk.message_reads
  UNION ALL SELECT account_id,charge FROM hash_talk.conversation_controls
  UNION ALL SELECT account_id,charge FROM hash_talk.device_presence
  UNION ALL SELECT account_id,charge FROM hash_talk.push_subscriptions
  UNION ALL SELECT account_id,charge FROM hash_talk.push_controls
  UNION ALL SELECT account_id,charge FROM hash_talk.call_controls
  UNION ALL SELECT account_id,charge-retained_bytes FROM hash_talk.personal_removals
  UNION ALL SELECT account_id,charge FROM hash_talk.message_recovery_keys
  UNION ALL SELECT sender,sender_charge FROM hash_talk.message_packets
  UNION ALL SELECT recipient,recipient_charge FROM hash_talk.message_packets
  UNION ALL SELECT account_id,charge FROM hash_talk.matrix_devices
  UNION ALL SELECT account_id,charge FROM hash_talk.matrix_one_time_keys
  UNION ALL SELECT account_id,charge FROM hash_talk.matrix_envelopes
  UNION ALL SELECT account_id,charge FROM hash_talk.group_controls
  UNION ALL SELECT account_id,charge FROM hash_talk.group_reads
  UNION ALL SELECT author,charge FROM hash_talk.status_posts
  UNION ALL SELECT author,charge FROM hash_talk.status_recipients
  UNION ALL SELECT author,charge FROM hash_talk.status_pages
  UNION ALL SELECT author,charge FROM hash_talk.status_media
) charged GROUP BY account_id;

-- Keeping profile-owned charges separate also preserves account/profile mapping
-- without rewriting historical rows when that mapping is inspected.
CREATE VIEW hash_talk.profile_quota_totals AS
SELECT profile_id,sum(bytes)::bigint AS used_bytes FROM (
  SELECT id AS profile_id,0::bigint AS bytes FROM hash_talk.public_profiles
  UNION ALL SELECT profile_id,charge FROM hash_talk.social_directories
  UNION ALL SELECT profile_id,charge FROM hash_talk.social_recovery
  UNION ALL SELECT profile_id,charge FROM hash_talk.social_matrix_devices
  UNION ALL SELECT profile_id,charge FROM hash_talk.social_matrix_keys
  UNION ALL SELECT recipient,charge FROM hash_talk.social_matrix_envelopes
  UNION ALL SELECT profile_id,charge FROM hash_talk.social_personal_secrets
  UNION ALL SELECT sender,sender_charge FROM hash_talk.social_media
  UNION ALL SELECT recipient,recipient_charge FROM hash_talk.social_media
  UNION ALL SELECT sender,sender_charge FROM hash_talk.social_messages
  UNION ALL SELECT recipient,recipient_charge FROM hash_talk.social_messages
) charged GROUP BY profile_id;

INSERT INTO hash_talk.account_quota_usage SELECT * FROM hash_talk.account_quota_totals;
INSERT INTO hash_talk.profile_quota_usage SELECT * FROM hash_talk.profile_quota_totals;

CREATE FUNCTION hash_talk.initialize_personal_quota() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME='accounts' THEN
    INSERT INTO hash_talk.account_quota_usage VALUES(NEW.id,0);
  ELSE
    INSERT INTO hash_talk.profile_quota_usage VALUES(NEW.id,0);
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER quota_initialize AFTER INSERT ON hash_talk.accounts
  FOR EACH ROW EXECUTE FUNCTION hash_talk.initialize_personal_quota();
CREATE TRIGGER quota_initialize AFTER INSERT ON hash_talk.public_profiles
  FOR EACH ROW EXECUTE FUNCTION hash_talk.initialize_personal_quota();

CREATE FUNCTION hash_talk.track_personal_quota() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE projection text; source_sql text; new_sql text; old_sql text;
  ledger text; owner_column text; parent_table text; parent_exists boolean;
  changed integer; delta record;
BEGIN
  IF TG_ARGV[0] IN ('profile','profile_pair') THEN
    ledger:='profile_quota_usage'; owner_column:='profile_id'; parent_table:='public_profiles';
  ELSE
    ledger:='account_quota_usage'; owner_column:='account_id'; parent_table:='accounts';
  END IF;
  CASE TG_ARGV[0]
    WHEN 'account_profile' THEN projection:='SELECT id AS owner_id,coalesce(octet_length(profile_ciphertext)+524,0)::bigint AS bytes FROM %1$s';
    WHEN 'removal' THEN projection:='SELECT account_id AS owner_id,(charge-retained_bytes)::bigint AS bytes FROM %1$s';
    WHEN 'account_pair','profile_pair' THEN projection:='SELECT sender AS owner_id,sender_charge::bigint AS bytes FROM %1$s UNION ALL SELECT recipient,recipient_charge::bigint FROM %1$s';
    ELSE projection:=format('SELECT %I AS owner_id,charge::bigint AS bytes FROM %%1$s',TG_ARGV[1]);
  END CASE;
  new_sql:=format(projection,'new_rows'); old_sql:=format(projection,'old_rows');
  CASE TG_OP
    WHEN 'INSERT' THEN source_sql:=new_sql;
    WHEN 'DELETE' THEN source_sql:='SELECT owner_id,-bytes AS bytes FROM ('||old_sql||') previous';
    ELSE source_sql:=new_sql||' UNION ALL SELECT owner_id,-bytes FROM ('||old_sql||') previous';
  END CASE;
  FOR delta IN EXECUTE 'SELECT owner_id,sum(bytes)::bigint AS bytes FROM ('||source_sql||') changes
    GROUP BY owner_id HAVING sum(bytes)<>0 ORDER BY owner_id'
  LOOP
    EXECUTE format('UPDATE hash_talk.%I SET used_bytes=used_bytes+$1 WHERE %I=$2',ledger,owner_column)
      USING delta.bytes,delta.owner_id;
    GET DIAGNOSTICS changed=ROW_COUNT;
    IF changed=0 THEN
      EXECUTE format('SELECT EXISTS(SELECT 1 FROM hash_talk.%I WHERE id=$1)',parent_table)
        INTO parent_exists USING delta.owner_id;
      IF parent_exists THEN RAISE EXCEPTION 'Personal quota accounting unavailable'; END IF;
    END IF;
  END LOOP;
  RETURN NULL;
END;
$$;

DO $$
DECLARE source record;
BEGIN
  FOR source IN SELECT * FROM (VALUES
    ('accounts','account_profile','id'),
    ('vault_operations','account','account_id'),
    ('organizations','account','account_id'),
    ('representative_credentials','account','account_id'),
    ('organization_domains','account','account_id'),
    ('daily_controls','account','account_id'),
    ('message_reads','account','account_id'),
    ('conversation_controls','account','account_id'),
    ('device_presence','account','account_id'),
    ('push_subscriptions','account','account_id'),
    ('push_controls','account','account_id'),
    ('call_controls','account','account_id'),
    ('personal_removals','removal','account_id'),
    ('message_recovery_keys','account','account_id'),
    ('message_packets','account_pair','sender'),
    ('matrix_devices','account','account_id'),
    ('matrix_one_time_keys','account','account_id'),
    ('matrix_envelopes','account','account_id'),
    ('group_controls','account','account_id'),
    ('group_reads','account','account_id'),
    ('status_posts','account','author'),
    ('status_recipients','account','author'),
    ('status_pages','account','author'),
    ('status_media','account','author'),
    ('social_directories','profile','profile_id'),
    ('social_recovery','profile','profile_id'),
    ('social_matrix_devices','profile','profile_id'),
    ('social_matrix_keys','profile','profile_id'),
    ('social_matrix_envelopes','profile','recipient'),
    ('social_personal_secrets','profile','profile_id'),
    ('social_media','profile_pair','sender'),
    ('social_messages','profile_pair','sender')
  ) sources(name,kind,owner_column)
  LOOP
    EXECUTE format('CREATE TRIGGER quota_insert AFTER INSERT ON hash_talk.%I
      REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT
      EXECUTE FUNCTION hash_talk.track_personal_quota(%L,%L)',source.name,source.kind,source.owner_column);
    EXECUTE format('CREATE TRIGGER quota_update AFTER UPDATE ON hash_talk.%I
      REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT
      EXECUTE FUNCTION hash_talk.track_personal_quota(%L,%L)',source.name,source.kind,source.owner_column);
    EXECUTE format('CREATE TRIGGER quota_delete AFTER DELETE ON hash_talk.%I
      REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT
      EXECUTE FUNCTION hash_talk.track_personal_quota(%L,%L)',source.name,source.kind,source.owner_column);
  END LOOP;
END;
$$;
