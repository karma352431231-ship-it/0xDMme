-- Scoped completion/deletion uses the existing per-connection SQL operating
-- allowance. It cannot add a payload promise or change immutable content.
ALTER TABLE hash_talk.content_allocations DROP CONSTRAINT content_allocations_scope_check;
ALTER TABLE hash_talk.content_allocations ADD CHECK(scope IN ('prepared','vault-reserve','vault-maintain'));
ALTER TABLE hash_talk.content_allocations ADD CHECK(scope<>'vault-maintain' OR bytes<=67108864);

CREATE FUNCTION hash_talk.consume_vault_maintenance(before_row hash_talk.vault_operations,
  after_row hash_talk.vault_operations,action text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE kind text:=current_setting('hash_talk.vault_maintenance',true); cost bigint;
BEGIN
  IF before_row.account_id::text IS DISTINCT FROM current_setting('hash_talk.content_account',true)
    OR before_row.id::text IS DISTINCT FROM current_setting('hash_talk.content_operation',true)
    OR before_row.writer::text IS DISTINCT FROM current_setting('hash_talk.content_writer',true)
    OR coalesce(current_setting('hash_talk.content_maintenance_row',true),'')<>'' THEN
    RAISE EXCEPTION 'Vault maintenance owner mismatch' USING ERRCODE='PCA01';
  END IF;
  IF action='UPDATE' AND kind='complete' THEN
    IF before_row.state<>'writing' OR after_row.state<>'accepted' OR after_row.writer IS NOT NULL
      OR after_row.sequence IS DISTINCT FROM (before_row.commit->>'sequence')::integer
      OR (to_jsonb(before_row)-ARRAY['state','writer','sequence']) IS DISTINCT FROM
        (to_jsonb(after_row)-ARRAY['state','writer','sequence']) THEN
      RAISE EXCEPTION 'Invalid vault completion' USING ERRCODE='PCA01';
    END IF;
    cost:=4*(pg_column_size(before_row)::bigint+pg_column_size(after_row)::bigint)+4096;
  ELSIF action='DELETE' AND kind='discard' AND before_row.state='discarding' THEN
    cost:=4*pg_column_size(before_row)::bigint+4096;
  ELSE
    RAISE EXCEPTION 'Unsupported vault maintenance' USING ERRCODE='PCA01';
  END IF;
  IF cost>hash_talk.active_content_allocation() THEN
    RAISE EXCEPTION 'Content allocation exhausted' USING ERRCODE='PCA01';
  END IF;
  PERFORM set_config('hash_talk.content_consumed',cost::text,true);
  PERFORM set_config('hash_talk.content_maintenance_row',before_row.id::text,true);
END;
$$;

CREATE FUNCTION hash_talk.enforce_allocated_vault_head() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE credit bigint; cost bigint; writes integer; operation hash_talk.vault_operations;
BEGIN
  credit:=hash_talk.active_content_allocation();
  IF credit IS NULL THEN
    IF TG_OP='DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP='DELETE' OR current_setting('hash_talk.vault_maintenance',true) IS DISTINCT FROM 'complete'
    OR NEW.account_id::text IS DISTINCT FROM current_setting('hash_talk.content_account',true) THEN
    RAISE EXCEPTION 'Invalid vault checkpoint allocation' USING ERRCODE='PCA01';
  END IF;
  SELECT * INTO operation FROM hash_talk.vault_operations
    WHERE account_id=NEW.account_id AND id::text=current_setting('hash_talk.content_maintenance_row',true)
      AND state='accepted';
  writes:=coalesce(nullif(current_setting('hash_talk.content_head_writes',true),''),'0')::integer;
  IF NOT FOUND OR NEW.sequence IS DISTINCT FROM operation.sequence OR NEW.head IS DISTINCT FROM operation.hash OR writes>=2 THEN
    RAISE EXCEPTION 'Vault checkpoint scope mismatch' USING ERRCODE='PCA01';
  END IF;
  -- UPSERT can run both BEFORE INSERT and BEFORE UPDATE for one checkpoint.
  cost:=coalesce(nullif(current_setting('hash_talk.content_consumed',true),''),'0')::bigint
    +4*pg_column_size(NEW)::bigint+4096;
  IF cost>credit THEN RAISE EXCEPTION 'Content allocation exhausted' USING ERRCODE='PCA01'; END IF;
  PERFORM set_config('hash_talk.content_consumed',cost::text,true);
  PERFORM set_config('hash_talk.content_head_writes',(writes+1)::text,true);
  RETURN NEW;
END;
$$;
CREATE TRIGGER vault_allocation_head BEFORE INSERT OR UPDATE OR DELETE ON hash_talk.vault_heads
  FOR EACH ROW EXECUTE FUNCTION hash_talk.enforce_allocated_vault_head();

CREATE FUNCTION hash_talk.assert_vault_maintenance_complete() RETURNS void LANGUAGE plpgsql AS $$
DECLARE kind text:=current_setting('hash_talk.vault_maintenance',true); valid boolean;
BEGIN
  IF hash_talk.active_content_allocation() IS NULL
    OR current_setting('hash_talk.content_maintenance_row',true) IS DISTINCT FROM current_setting('hash_talk.content_operation',true) THEN
    RAISE EXCEPTION 'Vault maintenance incomplete' USING ERRCODE='PCA01';
  END IF;
  IF kind='complete' THEN
    SELECT EXISTS(SELECT 1 FROM hash_talk.vault_heads h JOIN hash_talk.vault_operations o
      ON o.account_id=h.account_id AND o.sequence=h.sequence AND o.hash=h.head
      WHERE o.account_id::text=current_setting('hash_talk.content_account',true)
        AND o.id::text=current_setting('hash_talk.content_operation',true) AND o.state='accepted') INTO valid;
  ELSIF kind='discard' THEN
    SELECT NOT EXISTS(SELECT 1 FROM hash_talk.vault_operations WHERE
      account_id::text=current_setting('hash_talk.content_account',true)
      AND id::text=current_setting('hash_talk.content_operation',true)) INTO valid;
  END IF;
  IF valid IS DISTINCT FROM true THEN RAISE EXCEPTION 'Vault maintenance incomplete' USING ERRCODE='PCA01'; END IF;
END;
$$;

DO $$
DECLARE definition text; needle text;
BEGIN
  definition:=pg_get_functiondef('hash_talk.active_content_allocation()'::regprocedure);
  needle:='scope=''vault-reserve''';
  IF (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 THEN
    RAISE EXCEPTION 'Unexpected allocation scope definition';
  END IF;
  EXECUTE replace(definition,needle,'scope IN (''vault-reserve'',''vault-maintain'')');
  definition:=pg_get_functiondef('hash_talk.enforce_allocated_source()'::regprocedure);
  needle:='IF TG_TABLE_NAME<>''vault_operations'' OR TG_OP<>''INSERT'' THEN';
  IF (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 THEN
    RAISE EXCEPTION 'Unexpected allocation source definition';
  END IF;
  EXECUTE replace(definition,needle,$body$
  IF EXISTS(SELECT 1 FROM hash_talk.content_allocations WHERE transaction_id=pg_current_xact_id() AND scope='vault-maintain') THEN
    IF TG_TABLE_NAME<>'vault_operations' THEN
      RAISE EXCEPTION 'Unsupported maintenance source' USING ERRCODE='PCA01';
    END IF;
    PERFORM hash_talk.consume_vault_maintenance(OLD,NEW,TG_OP);
    IF TG_OP='DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME<>'vault_operations' OR TG_OP<>'INSERT' THEN$body$);
END;
$$;

-- A failed physical deletion can restore discarding -> reserved. Keep its prior
-- promise until deletion succeeds; restoration must not require an unpaid grant.
LOCK TABLE hash_talk.vault_operations IN SHARE ROW EXCLUSIVE MODE;
CREATE OR REPLACE VIEW hash_talk.storage_reservation_totals AS
WITH pending AS (
  SELECT 'vault_operations'::text AS source,id,charge::bigint AS bytes FROM hash_talk.vault_operations WHERE state IN ('reserved','writing','discarding')
  UNION ALL SELECT 'message_attachments',id,charge FROM hash_talk.message_attachments WHERE status IN ('reserved','writing','ready')
  UNION ALL SELECT 'group_media',id,charge FROM hash_talk.group_media WHERE status IN ('reserved','writing','ready')
  UNION ALL SELECT 'status_media',id,charge FROM hash_talk.status_media WHERE status IN ('reserved','writing','ready')
  UNION ALL SELECT 'social_media',id,charge FROM hash_talk.social_media WHERE status IN ('reserved','writing','ready')
  UNION ALL SELECT 'community_media',id,charge FROM hash_talk.community_media WHERE status IN ('uploading','processing')
), totals AS (
  SELECT source,get_byte(uuid_send(id),0) AS bucket,count(*)::bigint AS reservations,sum(bytes)::bigint AS reserved_bytes
  FROM pending GROUP BY source,get_byte(uuid_send(id),0)
)
SELECT sources.source,b.bucket::smallint,coalesce(t.reservations,0)::bigint AS reservations,
  coalesce(t.reserved_bytes,0)::bigint AS reserved_bytes
  FROM (VALUES('vault_operations'),('message_attachments'),('group_media'),
    ('status_media'),('social_media'),('community_media')) sources(source)
  CROSS JOIN generate_series(0,255) b(bucket)
  LEFT JOIN totals t ON t.source=sources.source AND t.bucket=b.bucket;
UPDATE hash_talk.storage_reservation_usage u SET reservations=t.reservations,reserved_bytes=t.reserved_bytes
  FROM hash_talk.storage_reservation_totals t WHERE u.source='vault_operations'
    AND u.source=t.source AND u.bucket=t.bucket
    AND (u.reservations,u.reserved_bytes) IS DISTINCT FROM (t.reservations,t.reserved_bytes);
DROP TRIGGER storage_insert ON hash_talk.vault_operations;
DROP TRIGGER storage_update ON hash_talk.vault_operations;
DROP TRIGGER storage_delete ON hash_talk.vault_operations;
CREATE TRIGGER storage_insert AFTER INSERT ON hash_talk.vault_operations
  REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT
  EXECUTE FUNCTION hash_talk.track_storage_reservations('state','{reserved,writing,discarding}');
CREATE TRIGGER storage_update AFTER UPDATE ON hash_talk.vault_operations
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT
  EXECUTE FUNCTION hash_talk.track_storage_reservations('state','{reserved,writing,discarding}');
CREATE TRIGGER storage_delete AFTER DELETE ON hash_talk.vault_operations
  REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT
  EXECUTE FUNCTION hash_talk.track_storage_reservations('state','{reserved,writing,discarding}');
CREATE INDEX vault_operations_interrupted ON hash_talk.vault_operations(account_id,id)
  WHERE state IN ('writing','discarding');
