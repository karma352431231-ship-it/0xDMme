-- Local preparation only. The legacy contribution and exact partition deltas
-- sum to the original public total; no source rows or charges are rewritten.
ALTER TABLE hash_talk.content_allocations ADD COLUMN scope text NOT NULL DEFAULT 'prepared'
  CHECK(scope IN ('prepared','vault-reserve'));
ALTER TABLE hash_talk.content_usage RENAME TO content_usage_legacy;
-- Cleanup of a partition-origin record belongs to the legacy contribution.
-- Components are signed; only their sum represents occupied logical bytes.
ALTER TABLE hash_talk.content_usage_legacy DROP CONSTRAINT content_usage_used_bytes_check;
ALTER TABLE hash_talk.content_usage_legacy ADD CHECK(used_bytes BETWEEN -9007199254740991 AND 9007199254740991);
CREATE TABLE hash_talk.content_usage_partitions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  used_bytes bigint NOT NULL DEFAULT 0 CHECK(used_bytes BETWEEN -9007199254740991 AND 9007199254740991)
) WITH (autovacuum_vacuum_scale_factor=0.05,autovacuum_vacuum_threshold=20);
INSERT INTO hash_talk.content_usage_partitions(used_bytes)
  SELECT 0 FROM generate_series(1,current_setting('max_connections')::integer);
CREATE VIEW hash_talk.content_usage AS
  SELECT singleton,(used_bytes+coalesce((SELECT sum(used_bytes) FROM hash_talk.content_usage_partitions),0))::bigint AS used_bytes
  FROM hash_talk.content_usage_legacy;

-- Fold idle signed components without waiting for a legacy writer or an owner.
-- This avoids accumulating historical traffic in otherwise empty ledger slots.
CREATE FUNCTION hash_talk.compact_content_usage() RETURNS void LANGUAGE plpgsql VOLATILE AS $$
DECLARE amount bigint;
BEGIN
  PERFORM used_bytes FROM hash_talk.content_usage_legacy WHERE singleton FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN RETURN; END IF;
  WITH slots AS MATERIALIZED (
    SELECT id,used_bytes FROM hash_talk.content_usage_partitions WHERE used_bytes<>0
      ORDER BY id LIMIT 128 FOR UPDATE SKIP LOCKED
  ), moved AS (
    UPDATE hash_talk.content_usage_partitions p SET used_bytes=0 FROM slots s WHERE p.id=s.id
      RETURNING s.used_bytes
  ) SELECT coalesce(sum(used_bytes),0)::bigint INTO amount FROM moved;
  IF amount<>0 THEN
    UPDATE hash_talk.content_usage_legacy SET used_bytes=used_bytes+amount WHERE singleton;
    IF NOT FOUND THEN RAISE EXCEPTION 'Global quota accounting unavailable'; END IF;
  END IF;
END;
$$;

-- A transaction-local binding is effective only for its current top-level xid,
-- a durable coordinator grant and the explicitly adopted source operation.
CREATE FUNCTION hash_talk.active_content_allocation() RETURNS bigint LANGUAGE plpgsql VOLATILE AS $$
DECLARE binding text:=nullif(current_setting('hash_talk.content_allocation',true),''); credit bigint;
BEGIN
  IF binding IS NULL THEN RETURN NULL; END IF;
  IF current_setting('hash_talk.storage_capacity_mode',true) IS DISTINCT FROM 'volume'
    OR current_setting('transaction_isolation')<>'read committed'
    OR current_setting('transaction_read_only')<>'off'
    OR binding<>pg_current_xact_id()::text THEN
    RAISE EXCEPTION 'Invalid content allocation owner' USING ERRCODE='PCA01';
  END IF;
  SELECT bytes INTO credit FROM hash_talk.content_allocations
    WHERE transaction_id=pg_current_xact_id() AND scope='vault-reserve';
  IF NOT FOUND THEN RAISE EXCEPTION 'Content allocation unavailable' USING ERRCODE='PCA01'; END IF;
  RETURN credit;
END;
$$;

CREATE FUNCTION hash_talk.guard_content_usage() RETURNS boolean LANGUAGE plpgsql VOLATILE AS $$
BEGIN
  IF hash_talk.active_content_allocation() IS NOT NULL THEN RETURN true; END IF;
  PERFORM used_bytes FROM hash_talk.content_usage_legacy WHERE singleton FOR UPDATE;
  RETURN FOUND;
END;
$$;

CREATE FUNCTION hash_talk.add_content_usage(amount bigint) RETURNS void LANGUAGE plpgsql VOLATILE AS $$
DECLARE partition_id bigint;
BEGIN
  IF hash_talk.active_content_allocation() IS NULL THEN
    UPDATE hash_talk.content_usage_legacy SET used_bytes=used_bytes+amount WHERE singleton;
  ELSE
    partition_id:=nullif(current_setting('hash_talk.content_partition',true),'')::bigint;
    IF partition_id IS NULL THEN
      SELECT id INTO partition_id FROM hash_talk.content_usage_partitions ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED;
      IF NOT FOUND THEN
        -- Exhausting the initially connection-sized set must not become a
        -- concurrency cap. Growth is bounded by simultaneous writers, not history.
        INSERT INTO hash_talk.content_usage_partitions DEFAULT VALUES RETURNING id INTO partition_id;
      END IF;
      PERFORM set_config('hash_talk.content_partition',partition_id::text,true);
    END IF;
    UPDATE hash_talk.content_usage_partitions SET used_bytes=used_bytes+amount WHERE id=partition_id;
  END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'Global quota accounting unavailable'; END IF;
END;
$$;

-- Keep historical SQL delta writers and fail-closed ledger deletion compatible.
CREATE FUNCTION hash_talk.write_content_usage_view() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    DELETE FROM hash_talk.content_usage_legacy WHERE singleton=OLD.singleton;
    RETURN OLD;
  END IF;
  IF NEW.singleton IS DISTINCT FROM OLD.singleton THEN RAISE EXCEPTION 'Invalid global ledger key'; END IF;
  PERFORM hash_talk.add_content_usage(NEW.used_bytes-OLD.used_bytes);
  RETURN NEW;
END;
$$;
CREATE TRIGGER content_usage_compatibility INSTEAD OF UPDATE OR DELETE ON hash_talk.content_usage
  FOR EACH ROW EXECUTE FUNCTION hash_talk.write_content_usage_view();

-- Preserve observable first baselines, but classify cleanup by this transaction's
-- own deltas: another independent writer may now commit between our statements.
CREATE OR REPLACE FUNCTION hash_talk.capture_storage_admission_baseline() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE kind text; before_bytes bigint; change bigint;
BEGIN
  IF current_setting('hash_talk.storage_capacity_mode',true) IS DISTINCT FROM 'volume' THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME IN ('content_usage_legacy','content_usage_partitions') THEN
    kind:='logical'; change:=NEW.used_bytes-OLD.used_bytes;
    SELECT used_bytes INTO before_bytes FROM hash_talk.content_usage WHERE singleton;
  ELSE
    kind:='pending'; change:=NEW.reserved_bytes-OLD.reserved_bytes;
    SELECT sum(reserved_bytes) INTO before_bytes FROM hash_talk.storage_reservation_usage;
  END IF;
  IF coalesce(current_setting('hash_talk.storage_'||kind||'_baseline',true),'')='' THEN
    PERFORM set_config('hash_talk.storage_'||kind||'_baseline',before_bytes::text,true);
  END IF;
  PERFORM set_config('hash_talk.storage_'||kind||'_delta',
    (coalesce(nullif(current_setting('hash_talk.storage_'||kind||'_delta',true),''),'0')::bigint+change)::text,true);
  RETURN NEW;
END;
$$;
CREATE TRIGGER storage_admission_baseline BEFORE UPDATE OF used_bytes ON hash_talk.content_usage_partitions
  FOR EACH ROW WHEN(OLD.used_bytes IS DISTINCT FROM NEW.used_bytes)
  EXECUTE FUNCTION hash_talk.capture_storage_admission_baseline();

CREATE FUNCTION hash_talk.enforce_allocated_source() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE credit bigint; consumed bigint; required bigint;
BEGIN
  credit:=hash_talk.active_content_allocation();
  IF credit IS NULL THEN
    IF TG_OP='DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME<>'vault_operations' OR TG_OP<>'INSERT' THEN
    RAISE EXCEPTION 'Source is not adopted by content allocation' USING ERRCODE='PCA01';
  END IF;
  consumed:=coalesce(nullif(current_setting('hash_talk.content_consumed',true),''),'0')::bigint;
  IF NEW.state<>'reserved' OR NEW.account_id::text IS DISTINCT FROM current_setting('hash_talk.content_account',true)
    OR NEW.id::text IS DISTINCT FROM current_setting('hash_talk.content_operation',true) OR consumed<>0 THEN
    RAISE EXCEPTION 'Content allocation scope mismatch' USING ERRCODE='PCA01';
  END IF;
  -- Pending filesystem charge plus conservative SQL/TOAST/index/WAL envelope.
  required:=NEW.charge::bigint+4*pg_column_size(NEW)::bigint+4096;
  IF required>credit THEN RAISE EXCEPTION 'Content allocation exhausted' USING ERRCODE='PCA01'; END IF;
  PERFORM set_config('hash_talk.content_consumed',required::text,true);
  RETURN NEW;
END;
$$;

DO $$
DECLARE source record; source_count integer; proc regprocedure; definition text; needle text;
BEGIN
  SELECT count(DISTINCT tgrelid) INTO source_count FROM pg_trigger
    WHERE tgfoid='hash_talk.track_statement_content_usage()'::regprocedure;
  IF source_count<>80 THEN RAISE EXCEPTION 'Unexpected global accounting catalog'; END IF;
  FOR source IN SELECT DISTINCT c.relname FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
    WHERE t.tgfoid='hash_talk.track_statement_content_usage()'::regprocedure
    UNION SELECT 'community_ranking_entries'
  LOOP
    EXECUTE format('CREATE TRIGGER content_allocation_source BEFORE INSERT OR UPDATE OR DELETE ON hash_talk.%I
      FOR EACH ROW EXECUTE FUNCTION hash_talk.enforce_allocated_source()',source.relname);
  END LOOP;
  -- Replace only the shared gate; preserve each owner and cross-table rule.
  needle:='PERFORM used_bytes FROM hash_talk.content_usage WHERE singleton FOR UPDATE;';
  FOREACH proc IN ARRAY ARRAY['hash_talk.track_group_quota()'::regprocedure,
    'hash_talk.track_personal_quota()'::regprocedure,'hash_talk.track_attachment_quota()'::regprocedure,
    'hash_talk.track_storage_reservations()'::regprocedure]
  LOOP
    definition:=pg_get_functiondef(proc);
    IF (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 THEN
      RAISE EXCEPTION 'Unexpected quota guard definition';
    END IF;
    EXECUTE replace(definition,needle,'PERFORM 1 WHERE hash_talk.guard_content_usage();');
  END LOOP;
  definition:=pg_get_functiondef('hash_talk.track_statement_content_usage()'::regprocedure);
  needle:='UPDATE hash_talk.content_usage SET used_bytes=used_bytes+amount WHERE singleton;';
  IF (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 THEN
    RAISE EXCEPTION 'Unexpected statement accounting definition';
  END IF;
  definition:=replace(definition,needle,'PERFORM hash_talk.add_content_usage(amount);');
  -- add_content_usage checks its own affected-row count, including missing slots.
  definition:=replace(definition,'IF NOT FOUND THEN RAISE EXCEPTION ''Global quota accounting unavailable''; END IF;','');
  EXECUTE definition;
END;
$$;
