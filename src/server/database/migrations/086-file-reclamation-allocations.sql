-- Scoped SQL confirmation after durable file removal. No payload/history rewrite.
ALTER TABLE hash_talk.content_allocations DROP CONSTRAINT content_allocations_scope_check;
ALTER TABLE hash_talk.content_allocations ADD CONSTRAINT content_allocations_scope_check
  CHECK(scope IN ('prepared','vault-reserve','vault-maintain','message-admit','message-read','message-remove','message-open','personal-clean','file-reclaim'));

CREATE FUNCTION hash_talk.file_reclamation_state(source_name text,selected uuid,owner_account uuid)
  RETURNS jsonb LANGUAGE plpgsql VOLATILE AS $$
DECLARE state jsonb;
BEGIN
  CASE source_name
    WHEN 'personal_removals' THEN SELECT to_jsonb(r) INTO state FROM hash_talk.personal_removals r
      WHERE r.account_id=owner_account AND r.id=selected AND r.kind='vault' AND r.retained_bytes>0 FOR UPDATE;
    WHEN 'message_attachments' THEN SELECT to_jsonb(r) INTO state FROM hash_talk.message_attachments r
      WHERE r.id=selected AND r.status='deleting' FOR UPDATE;
    WHEN 'social_media' THEN SELECT to_jsonb(r) INTO state FROM hash_talk.social_media r
      WHERE r.id=selected AND r.status='deleting' FOR UPDATE;
    ELSE RAISE EXCEPTION 'Unknown file reclamation source' USING ERRCODE='PCA01';
  END CASE;
  RETURN state;
END;
$$;

CREATE FUNCTION hash_talk.prepare_file_reclamation(source_name text,selected uuid,owner_account uuid)
  RETURNS TABLE(bytes bigint,actor uuid) LANGUAGE plpgsql AS $$
DECLARE before_state jsonb; after_state jsonb; initial_state jsonb; owners uuid[];
BEGIN
  IF selected IS NULL OR source_name IS NULL OR source_name NOT IN ('personal_removals','message_attachments','social_media')
    OR (source_name='personal_removals')<>(owner_account IS NOT NULL)
    OR current_setting('hash_talk.storage_capacity_mode',true) IS DISTINCT FROM 'volume'
    OR current_setting('transaction_isolation')<>'read committed'
    OR hash_talk.active_content_allocation() IS NOT NULL
    OR coalesce(current_setting('hash_talk.content_reclaim_source',true),'')<>'' THEN
    RAISE EXCEPTION 'Invalid file reclamation preparation' USING ERRCODE='PCA01';
  END IF;
  PERFORM pg_advisory_xact_lock_shared(hashtext('hash-talk:contact-admission'));
  -- Route first, acquire all account locks in one order, THEN lock byte owners.
  CASE source_name
    WHEN 'personal_removals' THEN SELECT to_jsonb(r) INTO initial_state FROM hash_talk.personal_removals r
      WHERE r.account_id=owner_account AND r.id=selected AND r.kind='vault' AND r.retained_bytes>0;
    WHEN 'message_attachments' THEN SELECT to_jsonb(r) INTO initial_state FROM hash_talk.message_attachments r WHERE r.id=selected AND r.status='deleting';
    WHEN 'social_media' THEN SELECT to_jsonb(r) INTO initial_state FROM hash_talk.social_media r WHERE r.id=selected AND r.status='deleting';
  END CASE;
  IF initial_state IS NULL THEN RETURN NEXT; RETURN; END IF;
  IF source_name='personal_removals' THEN owners:=ARRAY[owner_account];
  ELSIF source_name='message_attachments' THEN owners:=ARRAY[(initial_state->>'sender')::uuid,(initial_state->>'recipient')::uuid];
  ELSE SELECT array_agg(account_id ORDER BY account_id) INTO owners FROM hash_talk.public_profiles
    WHERE id IN ((initial_state->>'sender')::uuid,(initial_state->>'recipient')::uuid);
  END IF;
  IF owners IS NULL OR array_position(owners,NULL) IS NOT NULL OR cardinality(owners)<>(CASE WHEN source_name='personal_removals' THEN 1 ELSE 2 END) THEN
    RAISE EXCEPTION 'File reclamation owners unavailable' USING ERRCODE='PCA01';
  END IF;
  PERFORM id FROM hash_talk.accounts WHERE id=ANY(owners) ORDER BY id FOR UPDATE;
  before_state:=hash_talk.file_reclamation_state(source_name,selected,owner_account);
  IF before_state IS NULL THEN RETURN NEXT; RETURN; END IF;
  IF before_state->'sender' IS DISTINCT FROM initial_state->'sender'
    OR before_state->'recipient' IS DISTINCT FROM initial_state->'recipient' THEN
    RAISE EXCEPTION 'File reclamation routing changed' USING ERRCODE='PCA01';
  END IF;
  after_state:=CASE WHEN source_name='personal_removals' THEN before_state||jsonb_build_object(
    'charge',(before_state->>'charge')::bigint-(before_state->>'retained_bytes')::bigint,'retained_bytes',0) ELSE 'null'::jsonb END;
  actor:=owners[1];
  bytes:=32768+32*(octet_length(before_state::text)::bigint+octet_length(after_state::text)::bigint);
  PERFORM set_config('hash_talk.content_reclaim_source',source_name,true);
  PERFORM set_config('hash_talk.content_reclaim_actor',actor::text,true);
  PERFORM set_config('hash_talk.content_reclaim_id',selected::text,true);
  PERFORM set_config('hash_talk.content_reclaim_before',before_state::text,true);
  PERFORM set_config('hash_talk.content_reclaim_after',after_state::text,true);
  PERFORM set_config('hash_talk.content_reclaim_done','false',true);
  PERFORM set_config('hash_talk.content_consumed',(16*(octet_length(before_state::text)::bigint+octet_length(after_state::text)::bigint))::text,true);
  RETURN NEXT;
END;
$$;

CREATE FUNCTION hash_talk.consume_file_reclamation(source_name text,before_row jsonb,after_row jsonb,action text)
  RETURNS void LANGUAGE plpgsql AS $$
DECLARE credit bigint:=hash_talk.active_content_allocation(); consumed bigint;
BEGIN
  IF credit IS NULL OR source_name IS DISTINCT FROM current_setting('hash_talk.content_reclaim_source',true)
    OR current_setting('hash_talk.content_account',true) IS DISTINCT FROM current_setting('hash_talk.content_reclaim_actor',true)
    OR current_setting('hash_talk.content_operation',true) IS DISTINCT FROM current_setting('hash_talk.content_reclaim_id',true)
    OR current_setting('hash_talk.content_reclaim_done',true) IS DISTINCT FROM 'false'
    OR before_row IS DISTINCT FROM nullif(current_setting('hash_talk.content_reclaim_before',true),'')::jsonb
    OR after_row IS DISTINCT FROM nullif(current_setting('hash_talk.content_reclaim_after',true),'')::jsonb
    OR action<>(CASE WHEN source_name='personal_removals' THEN 'UPDATE' ELSE 'DELETE' END) THEN
    RAISE EXCEPTION 'Unsupported file reclamation effect' USING ERRCODE='PCA01';
  END IF;
  consumed:=coalesce(nullif(current_setting('hash_talk.content_consumed',true),''),'0')::bigint
    +4096+4*(pg_column_size(before_row)::bigint+pg_column_size(after_row)::bigint);
  IF consumed>credit THEN RAISE EXCEPTION 'File reclamation credit exhausted' USING ERRCODE='PCA01'; END IF;
  PERFORM set_config('hash_talk.content_consumed',consumed::text,true);
  PERFORM set_config('hash_talk.content_reclaim_done','true',true);
END;
$$;

CREATE FUNCTION hash_talk.assert_file_reclamation_complete() RETURNS void LANGUAGE plpgsql AS $$
DECLARE source_name text:=current_setting('hash_talk.content_reclaim_source',true);
  selected uuid:=nullif(current_setting('hash_talk.content_reclaim_id',true),'')::uuid;
  before_state jsonb:=nullif(current_setting('hash_talk.content_reclaim_before',true),'')::jsonb;
  actual jsonb;
BEGIN
  IF hash_talk.active_content_allocation() IS NULL OR NOT EXISTS(SELECT 1 FROM hash_talk.content_allocations
    WHERE transaction_id=pg_current_xact_id() AND scope='file-reclaim')
    OR current_setting('hash_talk.content_reclaim_done',true) IS DISTINCT FROM 'true'
    OR current_setting('hash_talk.content_account',true) IS DISTINCT FROM current_setting('hash_talk.content_reclaim_actor',true)
    OR current_setting('hash_talk.content_operation',true) IS DISTINCT FROM selected::text THEN
    RAISE EXCEPTION 'File reclamation incomplete' USING ERRCODE='PCA01';
  END IF;
  CASE source_name
    WHEN 'personal_removals' THEN SELECT to_jsonb(r) INTO actual FROM hash_talk.personal_removals r
      WHERE r.account_id=(before_state->>'account_id')::uuid AND r.kind='vault' AND r.id=selected;
    WHEN 'message_attachments' THEN SELECT to_jsonb(r) INTO actual FROM hash_talk.message_attachments r WHERE r.id=selected;
    WHEN 'social_media' THEN SELECT to_jsonb(r) INTO actual FROM hash_talk.social_media r WHERE r.id=selected;
    ELSE RAISE EXCEPTION 'Unknown file reclamation source' USING ERRCODE='PCA01';
  END CASE;
  IF coalesce(actual,'null'::jsonb) IS DISTINCT FROM nullif(current_setting('hash_talk.content_reclaim_after',true),'')::jsonb
    OR NOT EXISTS(SELECT 1 FROM hash_talk.content_usage WHERE singleton)
    OR NOT EXISTS(SELECT 1 FROM hash_talk.content_usage_partitions WHERE id=nullif(current_setting('hash_talk.content_partition',true),'')::bigint) THEN
    RAISE EXCEPTION 'File reclamation final state unavailable' USING ERRCODE='PCA01';
  END IF;
END;
$$;

DO $$
DECLARE definition text; needle text;
BEGIN
  definition:=pg_get_functiondef('hash_talk.active_content_allocation()'::regprocedure);
  needle:='''personal-clean'')';
  IF (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Unexpected reclamation scope definition'; END IF;
  EXECUTE replace(definition,needle,'''personal-clean'',''file-reclaim'')');
  definition:=pg_get_functiondef('hash_talk.enforce_allocated_source()'::regprocedure);
  needle:='IF EXISTS(SELECT 1 FROM hash_talk.content_allocations WHERE transaction_id=pg_current_xact_id() AND scope=''personal-clean'') THEN';
  IF (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Unexpected reclamation source definition'; END IF;
  EXECUTE replace(definition,needle,$body$IF EXISTS(SELECT 1 FROM hash_talk.content_allocations WHERE transaction_id=pg_current_xact_id() AND scope='file-reclaim') THEN
    PERFORM hash_talk.consume_file_reclamation(TG_TABLE_NAME,
      CASE WHEN TG_OP='INSERT' THEN 'null'::jsonb ELSE to_jsonb(OLD) END,
      CASE WHEN TG_OP='DELETE' THEN 'null'::jsonb ELSE to_jsonb(NEW) END,TG_OP);
    IF TG_OP='DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF EXISTS(SELECT 1 FROM hash_talk.content_allocations WHERE transaction_id=pg_current_xact_id() AND scope='personal-clean') THEN$body$);
END;
$$;
