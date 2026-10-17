-- Complete private upload reservation only. No payload/history conversion.
ALTER TABLE hash_talk.content_allocations DROP CONSTRAINT content_allocations_scope_check;
ALTER TABLE hash_talk.content_allocations ADD CONSTRAINT content_allocations_scope_check
  CHECK(scope IN ('prepared','vault-reserve','vault-maintain','message-admit','message-read','message-remove','message-open','personal-clean','file-reclaim','attachment-reserve'));

CREATE FUNCTION hash_talk.prepare_attachment_reservation(actor uuid,peer uuid,operation uuid,refs jsonb)
  RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE ref jsonb; before_state jsonb; after_state jsonb; plan jsonb:='{}'; selected uuid;
  new_count integer:=0; bytes bigint:=65536; metadata_bytes bigint:=0;
BEGIN
  IF actor IS NULL OR peer IS NULL OR actor=peer OR operation IS NULL OR refs IS NULL
    OR jsonb_typeof(refs)<>'array' OR jsonb_array_length(refs) NOT BETWEEN 1 AND 2
    OR (SELECT count(DISTINCT r->>'id') FROM jsonb_array_elements(refs) r)<>jsonb_array_length(refs)
    OR current_setting('hash_talk.storage_capacity_mode',true) IS DISTINCT FROM 'volume'
    OR current_setting('transaction_isolation')<>'read committed'
    OR hash_talk.active_content_allocation() IS NOT NULL
    OR coalesce(current_setting('hash_talk.content_attachment_plan',true),'')<>'' THEN
    RAISE EXCEPTION 'Invalid attachment reservation preparation' USING ERRCODE='PCA01';
  END IF;
  PERFORM pg_advisory_xact_lock_shared(hashtext('hash-talk:contact-admission'));
  PERFORM id FROM hash_talk.accounts WHERE id IN (actor,peer) ORDER BY id FOR UPDATE;
  IF EXISTS(SELECT 1 FROM hash_talk.message_packets WHERE id=operation) THEN
    RAISE EXCEPTION 'Attachment message already accepted' USING ERRCODE='PCA01';
  END IF;
  FOR ref IN SELECT r FROM jsonb_array_elements(refs) r ORDER BY r->>'id' LOOP
    selected:=(ref->>'id')::uuid;
    IF selected IS NULL OR octet_length(ref::text)>=4096 OR (ref->>'bytes')::integer NOT BETWEEN 1 AND 3000000 THEN
      RAISE EXCEPTION 'Invalid attachment reservation descriptor' USING ERRCODE='PCA01';
    END IF;
    SELECT to_jsonb(a) INTO before_state FROM hash_talk.message_attachments a WHERE id=selected FOR UPDATE;
    IF before_state IS NOT NULL THEN
      IF before_state->>'sender'<>actor::text OR before_state->>'recipient'<>peer::text
        OR before_state->>'message_id'<>operation::text OR before_state->'descriptor'<>ref OR before_state->>'status'='deleting' THEN
        RAISE EXCEPTION 'Attachment reservation changed' USING ERRCODE='PCA01';
      END IF;
      after_state:=before_state;
    ELSE
      after_state:=jsonb_build_object('id',selected,'message_id',operation,'sender',actor,'recipient',peer,
        'descriptor',ref,'bytes',(ref->>'bytes')::integer,'status','reserved','received','[]'::jsonb,
        'writer',NULL,'created_at',now(),'charge',(ref->>'bytes')::integer+4096);
      new_count:=new_count+1;
      -- Whole pending file promise plus concrete SQL/plan/index/WAL work.
      bytes:=bytes+(ref->>'bytes')::bigint+4096+32*octet_length(after_state::text)::bigint+16384;
    END IF;
    metadata_bytes:=metadata_bytes+8*(coalesce(octet_length(before_state::text),0)::bigint+octet_length(after_state::text)::bigint);
    bytes:=bytes+16*(coalesce(octet_length(before_state::text),0)::bigint+octet_length(after_state::text)::bigint);
    plan:=jsonb_set(plan,ARRAY[selected::text],jsonb_build_object('actor',actor,'peer',peer,'operation',operation,
      'before',before_state,'after',after_state,'done',false));
  END LOOP;
  IF new_count=0 THEN RETURN 0; END IF;
  IF EXISTS(SELECT 1 FROM hash_talk.message_attachments a WHERE a.message_id=operation AND NOT plan ? a.id::text) THEN
    RAISE EXCEPTION 'Attachment reservation selection changed' USING ERRCODE='PCA01';
  END IF;
  PERFORM set_config('hash_talk.content_attachment_plan',plan::text,true);
  PERFORM set_config('hash_talk.content_consumed',metadata_bytes::text,true);
  RETURN bytes;
END;
$$;

CREATE FUNCTION hash_talk.consume_attachment_reservation(source_name text,before_row jsonb,after_row jsonb,action text)
  RETURNS void LANGUAGE plpgsql AS $$
DECLARE plan jsonb:=nullif(current_setting('hash_talk.content_attachment_plan',true),'')::jsonb;
  selected text:=after_row->>'id'; item jsonb; consumed bigint; credit bigint:=hash_talk.active_content_allocation();
BEGIN
  item:=plan->selected;
  IF credit IS NULL OR source_name<>'message_attachments' OR action<>'INSERT' OR before_row IS NOT NULL
    OR item IS NULL OR item->'before'<>'null'::jsonb OR item->'done'<>'false'::jsonb
    OR item->>'actor' IS DISTINCT FROM current_setting('hash_talk.content_account',true)
    OR item->>'operation' IS DISTINCT FROM current_setting('hash_talk.content_operation',true)
    OR after_row IS DISTINCT FROM item->'after' THEN
    RAISE EXCEPTION 'Unsupported attachment reservation effect' USING ERRCODE='PCA01';
  END IF;
  consumed:=coalesce(nullif(current_setting('hash_talk.content_consumed',true),''),'0')::bigint
    +(after_row->>'charge')::bigint+4*octet_length(after_row::text)::bigint+4096;
  IF consumed>credit THEN RAISE EXCEPTION 'Attachment reservation envelope exhausted' USING ERRCODE='PCA01'; END IF;
  PERFORM set_config('hash_talk.content_consumed',consumed::text,true);
  PERFORM set_config('hash_talk.content_attachment_plan',jsonb_set(plan,ARRAY[selected,'done'],'true')::text,true);
END;
$$;

CREATE FUNCTION hash_talk.assert_attachment_reservation_complete() RETURNS void LANGUAGE plpgsql AS $$
DECLARE plan jsonb:=nullif(current_setting('hash_talk.content_attachment_plan',true),'')::jsonb;
  item record; actual jsonb; new_count integer:=0;
BEGIN
  IF hash_talk.active_content_allocation() IS NULL OR NOT EXISTS(SELECT 1 FROM hash_talk.content_allocations
    WHERE transaction_id=pg_current_xact_id() AND scope='attachment-reserve')
    OR plan IS NULL OR jsonb_typeof(plan)<>'object' OR (SELECT count(*) FROM jsonb_each(plan)) NOT BETWEEN 1 AND 2 THEN
    RAISE EXCEPTION 'Attachment reservation allocation unavailable' USING ERRCODE='PCA01';
  END IF;
  FOR item IN SELECT * FROM jsonb_each(plan) LOOP
    SELECT to_jsonb(a) INTO actual FROM hash_talk.message_attachments a WHERE a.id=item.key::uuid;
    IF item.value->>'actor' IS DISTINCT FROM current_setting('hash_talk.content_account',true)
      OR item.value->>'operation' IS DISTINCT FROM current_setting('hash_talk.content_operation',true)
      OR actual IS DISTINCT FROM item.value->'after'
      OR (item.value->'before'='null'::jsonb) IS DISTINCT FROM (item.value->'done'='true'::jsonb) THEN
      RAISE EXCEPTION 'Attachment reservation incomplete' USING ERRCODE='PCA01';
    END IF;
    IF item.value->'before'='null'::jsonb THEN
      new_count:=new_count+1;
      IF NOT EXISTS(SELECT 1 FROM hash_talk.storage_reservation_usage
        WHERE source='message_attachments' AND bucket=get_byte(uuid_send(item.key::uuid),0)) THEN
        RAISE EXCEPTION 'Attachment pending accounting unavailable' USING ERRCODE='PCA01';
      END IF;
    END IF;
  END LOOP;
  IF new_count=0 OR NOT EXISTS(SELECT 1 FROM hash_talk.content_usage WHERE singleton)
    OR NOT EXISTS(SELECT 1 FROM hash_talk.content_usage_partitions
      WHERE id=nullif(current_setting('hash_talk.content_partition',true),'')::bigint) THEN
    RAISE EXCEPTION 'Attachment global accounting unavailable' USING ERRCODE='PCA01';
  END IF;
END;
$$;

DO $$
DECLARE definition text; needle text;
BEGIN
  definition:=pg_get_functiondef('hash_talk.active_content_allocation()'::regprocedure);
  needle:='''file-reclaim'')';
  IF (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Unexpected attachment allocation scope'; END IF;
  EXECUTE replace(definition,needle,'''file-reclaim'',''attachment-reserve'')');
  definition:=pg_get_functiondef('hash_talk.enforce_allocated_source()'::regprocedure);
  needle:='IF EXISTS(SELECT 1 FROM hash_talk.content_allocations WHERE transaction_id=pg_current_xact_id() AND scope=''file-reclaim'') THEN';
  IF (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Unexpected attachment allocation source'; END IF;
  EXECUTE replace(definition,needle,$body$IF EXISTS(SELECT 1 FROM hash_talk.content_allocations WHERE transaction_id=pg_current_xact_id() AND scope='attachment-reserve') THEN
    PERFORM hash_talk.consume_attachment_reservation(TG_TABLE_NAME,
      CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END,
      CASE WHEN TG_OP='DELETE' THEN NULL ELSE to_jsonb(NEW) END,TG_OP);
    RETURN NEW;
  END IF;
  IF EXISTS(SELECT 1 FROM hash_talk.content_allocations WHERE transaction_id=pg_current_xact_id() AND scope='file-reclaim') THEN$body$);
END;
$$;
