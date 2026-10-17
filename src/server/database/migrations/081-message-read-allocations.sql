-- Source preparation only; clean pre-launch initialization is allowed. No old
-- message conversion/backfill is needed. Existing runtime writers keep gates.
ALTER TABLE hash_talk.content_allocations DROP CONSTRAINT content_allocations_scope_check;
ALTER TABLE hash_talk.content_allocations ADD CONSTRAINT content_allocations_scope_check
  CHECK(scope IN ('prepared','vault-reserve','vault-maintain','message-admit','message-read'));

CREATE FUNCTION hash_talk.consume_message_read(before_row hash_talk.message_reads,
  after_row hash_talk.message_reads,action text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE actor text:=current_setting('hash_talk.content_account',true);
  peer text:=current_setting('hash_talk.content_peer',true);
  device text:=current_setting('hash_talk.content_device',true);
  ids jsonb:=coalesce(nullif(current_setting('hash_talk.content_read_ids',true),''),'[]')::jsonb;
  epoch integer; valid boolean; effects jsonb; writes integer; cost bigint;
BEGIN
  IF action NOT IN ('INSERT','UPDATE') OR after_row.account_id::text IS DISTINCT FROM actor
    OR after_row.charge<>256 OR NOT ids ? after_row.message_id::text THEN
    RAISE EXCEPTION 'Read mark scope mismatch' USING ERRCODE='PCA01';
  END IF;
  IF action='UPDATE' AND (to_jsonb(before_row)-'share_epoch') IS DISTINCT FROM (to_jsonb(after_row)-'share_epoch') THEN
    RAISE EXCEPTION 'Immutable read mark changed' USING ERRCODE='PCA01';
  END IF;
  SELECT CASE WHEN dc.read_receipts THEN dc.receipt_epoch ELSE NULL END INTO epoch
    FROM hash_talk.daily_controls dc WHERE dc.account_id=after_row.account_id;
  IF after_row.share_epoch IS DISTINCT FROM epoch THEN
    RAISE EXCEPTION 'Read privacy epoch mismatch' USING ERRCODE='PCA01';
  END IF;
  SELECT EXISTS(SELECT 1 FROM hash_talk.message_packets m JOIN hash_talk.message_references r ON r.message_id=m.id
    WHERE m.id=after_row.message_id AND m.sender::text=peer AND m.recipient=after_row.account_id
      AND m.body IS NOT NULL AND m.relation IS NULL AND m.kind<>'profile' AND r.account_id=m.recipient
      AND r.device_id::text=device AND r.status='received' AND NOT EXISTS(SELECT 1 FROM hash_talk.personal_removals pr
        WHERE pr.account_id=m.recipient AND pr.kind='message' AND pr.id=m.id)) INTO valid;
  IF valid IS DISTINCT FROM true THEN RAISE EXCEPTION 'Read requires preserved device receipt' USING ERRCODE='PCA01'; END IF;
  effects:=coalesce(nullif(current_setting('hash_talk.content_read_effects',true),''),'{}')::jsonb;
  writes:=coalesce((effects->>after_row.message_id::text)::integer,0)+1;
  IF writes>2 THEN RAISE EXCEPTION 'Read effect repeated' USING ERRCODE='PCA01'; END IF;
  -- UPSERT can execute both BEFORE INSERT and BEFORE UPDATE. Charge both events.
  cost:=coalesce(nullif(current_setting('hash_talk.content_consumed',true),''),'0')::bigint
    +4*(pg_column_size(after_row)::bigint+CASE WHEN action='UPDATE' THEN pg_column_size(before_row)::bigint ELSE 0 END)+4096
    +CASE WHEN action='INSERT' THEN after_row.charge ELSE 0 END;
  IF cost>hash_talk.active_content_allocation() THEN RAISE EXCEPTION 'Content allocation exhausted' USING ERRCODE='PCA01'; END IF;
  PERFORM set_config('hash_talk.content_consumed',cost::text,true);
  PERFORM set_config('hash_talk.content_read_effects',jsonb_set(effects,ARRAY[after_row.message_id::text],to_jsonb(writes),true)::text,true);
END;
$$;

CREATE FUNCTION hash_talk.assert_message_reads_complete() RETURNS void LANGUAGE plpgsql AS $$
DECLARE actor uuid:=nullif(current_setting('hash_talk.content_account',true),'')::uuid;
  peer uuid:=nullif(current_setting('hash_talk.content_peer',true),'')::uuid;
  device uuid:=nullif(current_setting('hash_talk.content_device',true),'')::uuid;
  ids jsonb:=coalesce(nullif(current_setting('hash_talk.content_read_ids',true),''),'[]')::jsonb;
  effects jsonb:=coalesce(nullif(current_setting('hash_talk.content_read_effects',true),''),'{}')::jsonb;
  epoch integer; valid boolean;
BEGIN
  IF hash_talk.active_content_allocation() IS NULL OR NOT EXISTS(SELECT 1 FROM hash_talk.content_allocations
    WHERE transaction_id=pg_current_xact_id() AND scope='message-read') OR jsonb_array_length(ids)=0 THEN
    RAISE EXCEPTION 'Read allocation unavailable' USING ERRCODE='PCA01';
  END IF;
  SELECT CASE WHEN dc.read_receipts THEN dc.receipt_epoch ELSE NULL END INTO epoch
    FROM hash_talk.daily_controls dc WHERE dc.account_id=actor;
  SELECT count(*)=jsonb_array_length(ids) INTO valid FROM hash_talk.message_reads read
    JOIN hash_talk.message_packets m ON m.id=read.message_id
    JOIN hash_talk.message_references r ON r.message_id=m.id AND r.account_id=actor AND r.device_id=device
    WHERE read.account_id=actor AND ids ? read.message_id::text AND effects ? read.message_id::text
      AND read.charge=256 AND read.share_epoch IS NOT DISTINCT FROM epoch
      AND m.sender=peer AND m.recipient=actor AND m.body IS NOT NULL AND m.relation IS NULL AND m.kind<>'profile'
      AND r.status='received' AND NOT EXISTS(SELECT 1 FROM hash_talk.personal_removals pr WHERE pr.account_id=actor AND pr.kind='message' AND pr.id=m.id);
  IF valid IS DISTINCT FROM true THEN RAISE EXCEPTION 'Read batch incomplete' USING ERRCODE='PCA01'; END IF;
END;
$$;

DO $$
DECLARE definition text; needle text;
BEGIN
  definition:=pg_get_functiondef('hash_talk.active_content_allocation()'::regprocedure);
  needle:='scope IN (''vault-reserve'',''vault-maintain'',''message-admit'')';
  IF (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 THEN
    RAISE EXCEPTION 'Unexpected allocation scope definition';
  END IF;
  EXECUTE replace(definition,needle,'scope IN (''vault-reserve'',''vault-maintain'',''message-admit'',''message-read'')');
  definition:=pg_get_functiondef('hash_talk.enforce_allocated_source()'::regprocedure);
  needle:='IF EXISTS(SELECT 1 FROM hash_talk.content_allocations WHERE transaction_id=pg_current_xact_id() AND scope=''message-admit'') THEN';
  IF (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 THEN
    RAISE EXCEPTION 'Unexpected allocation source definition';
  END IF;
  EXECUTE replace(definition,needle,$body$
  IF EXISTS(SELECT 1 FROM hash_talk.content_allocations WHERE transaction_id=pg_current_xact_id() AND scope='message-read') THEN
    IF TG_TABLE_NAME<>'message_reads' OR TG_OP NOT IN ('INSERT','UPDATE') THEN
      RAISE EXCEPTION 'Unsupported read allocation source' USING ERRCODE='PCA01';
    END IF;
    PERFORM hash_talk.consume_message_read(OLD,NEW,TG_OP);
    RETURN NEW;
  END IF;
  IF EXISTS(SELECT 1 FROM hash_talk.content_allocations WHERE transaction_id=pg_current_xact_id() AND scope='message-admit') THEN$body$);
END;
$$;
