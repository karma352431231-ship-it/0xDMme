-- Prepared private-message admission only. Preserve source data, charges and
-- old migration checksums; unrelated writers retain their legacy guard.
ALTER TABLE hash_talk.content_allocations DROP CONSTRAINT content_allocations_scope_check;
ALTER TABLE hash_talk.content_allocations ADD CONSTRAINT content_allocations_scope_check
  CHECK(scope IN ('prepared','vault-reserve','vault-maintain','message-admit'));

CREATE FUNCTION hash_talk.mark_message_admission(kind text,owner text,maximum integer) RETURNS void LANGUAGE plpgsql AS $$
DECLARE setting text:='hash_talk.content_message_'||kind; marks jsonb; writes integer;
BEGIN
  marks:=coalesce(nullif(current_setting(setting,true),''),'{}')::jsonb;
  writes:=coalesce((marks->>owner)::integer,0)+1;
  IF writes>maximum THEN RAISE EXCEPTION 'Message admission effect repeated' USING ERRCODE='PCA01'; END IF;
  PERFORM set_config(setting,jsonb_set(marks,ARRAY[owner],to_jsonb(writes),true)::text,true);
END;
$$;

CREATE FUNCTION hash_talk.consume_message_admission(source text,before_row jsonb,after_row jsonb,action text,cost bigint)
  RETURNS void LANGUAGE plpgsql AS $$
DECLARE sender text:=nullif(current_setting('hash_talk.content_account',true),'');
  recipient text:=nullif(current_setting('hash_talk.content_peer',true),'');
  operation text:=nullif(current_setting('hash_talk.content_operation',true),'');
  owner text; revision bigint; baselines jsonb; consumed bigint; allowed boolean:=false; refs jsonb; changed jsonb;
BEGIN
  IF sender IS NULL OR recipient IS NULL OR operation IS NULL OR sender=recipient THEN
    RAISE EXCEPTION 'Message admission binding unavailable' USING ERRCODE='PCA01';
  END IF;
  CASE source
    WHEN 'message_packets' THEN
      refs:=coalesce((SELECT jsonb_agg(r->'id') FROM jsonb_array_elements(coalesce(after_row->'body'->'attachments','[]')) r),'[]');
      allowed:=action='INSERT' AND after_row->>'id'=operation AND after_row->>'sender'=sender
        AND after_row->>'recipient'=recipient AND after_row->'body'->>'id'=operation
        AND after_row->'body'->>'sender'=sender AND after_row->'body'->>'recipient'=recipient
        AND after_row->'deletion'='null'::jsonb AND after_row->'queue_active'='true'::jsonb
        AND refs=coalesce(nullif(current_setting('hash_talk.content_message_attachments',true),''),'[]')::jsonb
        AND coalesce(current_setting('hash_talk.content_message_row',true),'')='';
      PERFORM set_config('hash_talk.content_message_row',operation,true);
    WHEN 'message_attachments' THEN
      refs:=coalesce(nullif(current_setting('hash_talk.content_message_attachments',true),''),'[]')::jsonb;
      changed:=coalesce(nullif(current_setting('hash_talk.content_message_accepted',true),''),'[]')::jsonb;
      allowed:=action='UPDATE' AND before_row->>'status'='ready' AND after_row->>'status'='accepted'
        AND before_row->>'message_id'=operation AND before_row->>'sender'=sender AND before_row->>'recipient'=recipient
        AND (before_row-'status')=(after_row-'status') AND refs ? (after_row->>'id') AND NOT changed ? (after_row->>'id');
      PERFORM set_config('hash_talk.content_message_accepted',(changed||jsonb_build_array(after_row->>'id'))::text,true);
    WHEN 'message_heads' THEN
      owner:=after_row->>'account_id';
      allowed:=owner IN (sender,recipient) AND ((action='INSERT' AND (after_row->>'revision')::bigint=1)
        OR (action='UPDATE' AND (before_row-'revision')=(after_row-'revision')
          AND (after_row->>'revision')::bigint=(before_row->>'revision')::bigint+1));
      IF allowed THEN
        baselines:=coalesce(nullif(current_setting('hash_talk.content_message_baselines',true),''),'{}')::jsonb;
        IF NOT baselines ? owner THEN
          SELECT coalesce((SELECT h.revision FROM hash_talk.message_heads h WHERE h.account_id=owner::uuid),0) INTO revision;
          PERFORM set_config('hash_talk.content_message_baselines',jsonb_set(baselines,ARRAY[owner],to_jsonb(revision),true)::text,true);
        END IF;
        -- UPSERT can execute both BEFORE INSERT and BEFORE UPDATE.
        PERFORM hash_talk.mark_message_admission('heads',owner,2);
      END IF;
    WHEN 'message_changes' THEN
      owner:=coalesce(after_row,before_row)->>'account_id';
      SELECT h.revision INTO revision FROM hash_talk.message_heads h WHERE h.account_id=owner::uuid;
      allowed:=owner IN (sender,recipient) AND revision IS NOT NULL
        AND coalesce(nullif(current_setting('hash_talk.content_message_heads',true),''),'{}')::jsonb ? owner;
      IF action='INSERT' THEN
        allowed:=allowed AND (after_row->>'revision')::bigint=revision AND after_row->'ids'=jsonb_build_array(operation)
          AND (after_row->>'charge')::bigint=528;
        IF allowed THEN PERFORM hash_talk.mark_message_admission('journals',owner,1); END IF;
      ELSE
        allowed:=allowed AND action='DELETE' AND (before_row->>'revision')::bigint<=revision-256;
      END IF;
    WHEN 'message_references' THEN
      owner:=after_row->>'account_id';
      allowed:=action='INSERT' AND after_row->>'message_id'=operation AND owner IN (sender,recipient)
        AND after_row->>'status'='pending' AND EXISTS(SELECT 1 FROM hash_talk.device_directories d,
          jsonb_array_elements(d.event->'devices') device WHERE d.account_id=owner::uuid AND device->>'id'=after_row->>'device_id');
    WHEN 'push_subscriptions' THEN
      allowed:=action='UPDATE' AND before_row->>'account_id'=recipient
        AND (before_row-ARRAY['pending','generation','attempts','next_attempt'])=(after_row-ARRAY['pending','generation','attempts','next_attempt'])
        AND after_row->'pending'='true'::jsonb AND (after_row->>'attempts')::integer=0
        AND (after_row->>'generation')::bigint=(before_row->>'generation')::bigint+1
        AND (after_row->>'next_attempt')::timestamptz=now();
      IF allowed THEN PERFORM hash_talk.mark_message_admission('pushes',after_row->>'device_id',1); END IF;
    ELSE NULL;
  END CASE;
  IF allowed IS DISTINCT FROM true THEN RAISE EXCEPTION 'Unsupported message admission effect' USING ERRCODE='PCA01'; END IF;
  consumed:=coalesce(nullif(current_setting('hash_talk.content_consumed',true),''),'0')::bigint+cost;
  IF consumed>hash_talk.active_content_allocation() THEN
    RAISE EXCEPTION 'Content allocation exhausted' USING ERRCODE='PCA01';
  END IF;
  PERFORM set_config('hash_talk.content_consumed',consumed::text,true);
END;
$$;

CREATE FUNCTION hash_talk.assert_message_admission_complete() RETURNS void LANGUAGE plpgsql AS $$
DECLARE packet hash_talk.message_packets; accepted jsonb; refs jsonb; baselines jsonb; valid boolean;
BEGIN
  IF hash_talk.active_content_allocation() IS NULL OR NOT EXISTS(SELECT 1 FROM hash_talk.content_allocations
    WHERE transaction_id=pg_current_xact_id() AND scope='message-admit') THEN
    RAISE EXCEPTION 'Message admission allocation unavailable' USING ERRCODE='PCA01';
  END IF;
  SELECT * INTO packet FROM hash_talk.message_packets WHERE id::text=current_setting('hash_talk.content_message_row',true)
    AND id::text=current_setting('hash_talk.content_operation',true)
    AND sender::text=current_setting('hash_talk.content_account',true) AND recipient::text=current_setting('hash_talk.content_peer',true);
  IF NOT FOUND THEN RAISE EXCEPTION 'Message admission incomplete' USING ERRCODE='PCA01'; END IF;
  baselines:=coalesce(nullif(current_setting('hash_talk.content_message_baselines',true),''),'{}')::jsonb;
  SELECT count(*)=2 INTO valid FROM hash_talk.message_heads h JOIN hash_talk.message_changes c USING(account_id,revision)
    WHERE h.account_id IN (packet.sender,packet.recipient) AND c.ids=ARRAY[packet.id] AND c.charge=528
      AND h.revision=(baselines->>h.account_id::text)::bigint+1
      AND coalesce(nullif(current_setting('hash_talk.content_message_journals',true),''),'{}')::jsonb ? h.account_id::text;
  IF valid IS DISTINCT FROM true THEN RAISE EXCEPTION 'Message change checkpoint incomplete' USING ERRCODE='PCA01'; END IF;
  refs:=coalesce(packet.body->'attachments','[]');
  accepted:=coalesce(nullif(current_setting('hash_talk.content_message_accepted',true),''),'[]')::jsonb;
  IF jsonb_array_length(refs)<>jsonb_array_length(accepted) OR EXISTS(
    SELECT 1 FROM jsonb_array_elements(refs) ref WHERE NOT accepted ? (ref->>'id') OR NOT EXISTS(
      SELECT 1 FROM hash_talk.message_attachments a WHERE a.id::text=ref->>'id' AND a.message_id=packet.id
        AND a.sender=packet.sender AND a.recipient=packet.recipient AND a.status='accepted' AND a.descriptor=ref)) THEN
    RAISE EXCEPTION 'Message attachment acceptance incomplete' USING ERRCODE='PCA01';
  END IF;
  WITH expected AS (
    SELECT d.account_id,(device->>'id')::uuid AS device_id FROM hash_talk.device_directories d,
      jsonb_array_elements(d.event->'devices') device WHERE d.account_id IN (packet.sender,packet.recipient)
      AND NOT EXISTS(SELECT 1 FROM hash_talk.personal_removals r WHERE r.account_id=d.account_id
        AND r.kind='message' AND r.id::text=packet.body->'relation'->>'id')
  ), actual AS (SELECT account_id,device_id FROM hash_talk.message_references WHERE message_id=packet.id)
  SELECT NOT EXISTS((SELECT * FROM expected EXCEPT SELECT * FROM actual)
    UNION ALL (SELECT * FROM actual EXCEPT SELECT * FROM expected)) INTO valid;
  IF valid IS DISTINCT FROM true THEN RAISE EXCEPTION 'Message device references incomplete' USING ERRCODE='PCA01'; END IF;
  IF packet.kind<>'profile' AND packet.relation IS NULL AND NOT EXISTS(SELECT 1 FROM hash_talk.conversation_controls cc
    WHERE cc.account_id=packet.recipient AND cc.peer=packet.sender AND cc.muted_until>(extract(epoch FROM now())*1000)::bigint)
    AND EXISTS(SELECT 1 FROM hash_talk.push_subscriptions s WHERE s.account_id=packet.recipient
      AND NOT coalesce(nullif(current_setting('hash_talk.content_message_pushes',true),''),'{}')::jsonb ? s.device_id::text) THEN
    RAISE EXCEPTION 'Message push hints incomplete' USING ERRCODE='PCA01';
  END IF;
END;
$$;

DO $$
DECLARE definition text; needle text; source text;
BEGIN
  definition:=pg_get_functiondef('hash_talk.active_content_allocation()'::regprocedure);
  needle:='scope IN (''vault-reserve'',''vault-maintain'')';
  IF (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 THEN
    RAISE EXCEPTION 'Unexpected allocation scope definition';
  END IF;
  EXECUTE replace(definition,needle,'scope IN (''vault-reserve'',''vault-maintain'',''message-admit'')');
  definition:=pg_get_functiondef('hash_talk.enforce_allocated_source()'::regprocedure);
  needle:='IF EXISTS(SELECT 1 FROM hash_talk.content_allocations WHERE transaction_id=pg_current_xact_id() AND scope=''vault-maintain'') THEN';
  IF (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 THEN
    RAISE EXCEPTION 'Unexpected allocation source definition';
  END IF;
  EXECUTE replace(definition,needle,$body$
  IF EXISTS(SELECT 1 FROM hash_talk.content_allocations WHERE transaction_id=pg_current_xact_id() AND scope='message-admit') THEN
    PERFORM hash_talk.consume_message_admission(TG_TABLE_NAME,
      CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END,
      CASE WHEN TG_OP='DELETE' THEN NULL ELSE to_jsonb(NEW) END,TG_OP,
      4*(CASE WHEN TG_OP='INSERT' THEN 0 ELSE pg_column_size(OLD)::bigint END
        +CASE WHEN TG_OP='DELETE' THEN 0 ELSE pg_column_size(NEW)::bigint END)+4096
        +CASE WHEN TG_OP='INSERT' AND TG_TABLE_NAME IN ('message_packets','message_changes') THEN (to_jsonb(NEW)->>'charge')::bigint ELSE 0 END);
    IF TG_OP='DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF EXISTS(SELECT 1 FROM hash_talk.content_allocations WHERE transaction_id=pg_current_xact_id() AND scope='vault-maintain') THEN$body$);
  FOREACH source IN ARRAY ARRAY['message_heads','message_references'] LOOP
    EXECUTE format('CREATE TRIGGER content_allocation_message_metadata BEFORE INSERT OR UPDATE OR DELETE ON hash_talk.%I
      FOR EACH ROW EXECUTE FUNCTION hash_talk.enforce_allocated_source()',source);
  END LOOP;
END;
$$;
