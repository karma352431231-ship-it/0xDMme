-- Keep published migration checksums and the existing global admission contract.
-- New owner counters always follow the global ledger, including reductions whose
-- source statement changes no global bytes. Zero net deltas still take no lock.
-- Removing this global gate belongs to the separate capacity-reservation design.

CREATE OR REPLACE FUNCTION hash_talk.track_group_quota() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE ledger_locked boolean:=false; source_sql text; new_sql text; old_sql text;
  media_expression text:='0::bigint'; accepted_expression text:='0::bigint';
  change record;
BEGIN
  IF TG_TABLE_NAME='group_media' THEN
    media_expression:='bytes::bigint';
    accepted_expression:='CASE WHEN status=''accepted'' THEN bytes::bigint ELSE 0::bigint END';
  END IF;
  new_sql:=format('SELECT %I AS group_id,%I::bigint AS text_bytes,%s AS media_bytes,%s AS accepted_media_bytes FROM new_rows',
    TG_ARGV[0],TG_ARGV[1],media_expression,accepted_expression);
  old_sql:=format('SELECT %I AS group_id,-%I::bigint AS text_bytes,-(%s) AS media_bytes,-(%s) AS accepted_media_bytes FROM old_rows',
    TG_ARGV[0],TG_ARGV[1],media_expression,accepted_expression);
  CASE TG_OP
    WHEN 'INSERT' THEN source_sql:=new_sql;
    WHEN 'DELETE' THEN source_sql:=old_sql;
    ELSE source_sql:=new_sql||' UNION ALL '||old_sql;
  END CASE;
  FOR change IN EXECUTE 'SELECT group_id,sum(text_bytes)::bigint AS text_bytes,
      sum(media_bytes)::bigint AS media_bytes,sum(accepted_media_bytes)::bigint AS accepted_media_bytes
      FROM ('||source_sql||') delta GROUP BY group_id
      HAVING sum(text_bytes)<>0 OR sum(media_bytes)<>0 OR sum(accepted_media_bytes)<>0
      ORDER BY group_id'
  LOOP
    -- Preserve global-ledger-before-owner ordering even for charge-only or
    -- accepted-occupancy deltas that do not run an existing global trigger.
    IF NOT ledger_locked THEN
      PERFORM used_bytes FROM hash_talk.content_usage WHERE singleton FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Global quota accounting unavailable'; END IF;
      ledger_locked:=true;
    END IF;
    IF TG_TABLE_NAME='groups' AND TG_OP='INSERT' THEN
      INSERT INTO hash_talk.group_quota_usage VALUES
        (change.group_id,change.text_bytes,change.media_bytes,change.accepted_media_bytes);
    ELSE
      UPDATE hash_talk.group_quota_usage SET
        text_bytes=text_bytes+change.text_bytes,
        media_bytes=media_bytes+change.media_bytes,
        accepted_media_bytes=accepted_media_bytes+change.accepted_media_bytes
        WHERE group_id=change.group_id;
      IF NOT FOUND AND EXISTS(SELECT 1 FROM hash_talk.groups WHERE id=change.group_id) THEN
        RAISE EXCEPTION 'Group quota accounting unavailable';
      END IF;
    END IF;
  END LOOP;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION hash_talk.track_personal_quota() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE ledger_locked boolean:=false; projection text; source_sql text; new_sql text; old_sql text;
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
    -- Preserve global-ledger-before-owner ordering even for charge-only or
    -- accepted-occupancy deltas that do not run an existing global trigger.
    IF NOT ledger_locked THEN
      PERFORM used_bytes FROM hash_talk.content_usage WHERE singleton FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Global quota accounting unavailable'; END IF;
      ledger_locked:=true;
    END IF;
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
