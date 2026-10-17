-- Prepared mixed cleanup only. No history conversion, reset or activation.
ALTER TABLE hash_talk.content_allocations DROP CONSTRAINT content_allocations_scope_check;
ALTER TABLE hash_talk.content_allocations ADD CONSTRAINT content_allocations_scope_check
  CHECK(scope IN ('prepared','vault-reserve','vault-maintain','message-admit','message-read','message-remove','message-open','personal-clean'));
ALTER TABLE hash_talk.content_allocations ADD CHECK(scope<>'personal-clean' OR bytes<=67108864);

CREATE FUNCTION hash_talk.social_cleanup_metadata(packet hash_talk.social_messages)
  RETURNS jsonb LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE available boolean:=packet.body IS NOT NULL;
BEGIN
  packet.body:=NULL;
  RETURN (to_jsonb(packet)-'body')||jsonb_build_object('available',available);
END;
$$;

CREATE FUNCTION hash_talk.ensure_personal_cleanup_plan() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  -- The published 082 plan is a composition contract, reused for private effects
  -- and the one actor journal. Preserve its shape and transaction-local lifetime.
  IF to_regclass('pg_temp.hash_talk_removal_plan') IS NULL THEN
    CREATE TEMPORARY TABLE hash_talk_removal_plan (
      source text NOT NULL,id uuid NOT NULL,before_state jsonb NOT NULL,after_state jsonb NOT NULL,
      reference_count integer NOT NULL DEFAULT 0,collect boolean NOT NULL DEFAULT false,
      max_writes integer NOT NULL DEFAULT 1,writes integer NOT NULL DEFAULT 0,
      PRIMARY KEY(source,id)
    ) ON COMMIT DELETE ROWS;
  END IF;
  IF to_regclass('pg_temp.hash_talk_personal_plan') IS NULL THEN
    CREATE TEMPORARY TABLE hash_talk_personal_plan (
      source text NOT NULL,id uuid NOT NULL,detail text NOT NULL DEFAULT '',
      before_state jsonb NOT NULL,after_state jsonb NOT NULL,
      collect boolean NOT NULL DEFAULT false,max_writes integer NOT NULL DEFAULT 1,writes integer NOT NULL DEFAULT 0,
      PRIMARY KEY(source,id,detail)
    ) ON COMMIT DELETE ROWS;
  END IF;
  IF EXISTS(SELECT 1 FROM pg_temp.hash_talk_personal_plan) THEN
    RAISE EXCEPTION 'Personal plan already occupied' USING ERRCODE='PCA01';
  END IF;
END;
$$;

CREATE FUNCTION hash_talk.prepare_personal_cleanup(actor uuid,selection jsonb,removal_proof jsonb,
  proof_bytes integer,participants uuid[]) RETURNS TABLE(bytes bigint,operation uuid) LANGUAGE plpgsql AS $$
DECLARE item jsonb; changed jsonb; private_items jsonb; private_bytes bigint; private_operation uuid;
  prior text; profile_actor uuid; owner_a uuid; owner_b uuid; retained integer; collect_body boolean;
  vault_row hash_talk.vault_operations; social_row hash_talk.social_messages; metadata jsonb; final_state jsonb;
  heads jsonb; overhead bigint; extra_bytes bigint; budget_probe bigint; media_probe bigint; receipt_probe bigint;
BEGIN
  IF actor IS NULL OR participants IS NULL OR NOT actor=ANY(participants)
    OR current_setting('hash_talk.storage_capacity_mode',true) IS DISTINCT FROM 'volume'
    OR current_setting('transaction_isolation')<>'read committed' OR hash_talk.active_content_allocation() IS NOT NULL
    OR coalesce(current_setting('hash_talk.content_personal_private',true),'')<>''
    OR jsonb_typeof(selection) IS DISTINCT FROM 'array' OR proof_bytes IS NULL OR proof_bytes NOT BETWEEN 1 AND 4096
    OR jsonb_typeof(removal_proof) IS DISTINCT FROM 'object'
    OR (removal_proof->'payload'->>'revision') IS NULL
    OR (removal_proof->'payload'->>'revision')::integer NOT BETWEEN 1 AND 128 THEN
    RAISE EXCEPTION 'Invalid personal cleanup preparation' USING ERRCODE='PCA01';
  END IF;
  IF jsonb_array_length(selection) NOT BETWEEN 1 AND 8
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(selection) e WHERE e->>'kind' NOT IN ('vault','message','dm-message') OR e->>'kind' IS NULL)
    OR (SELECT count(DISTINCT (e->>'kind',e->>'id')) FROM jsonb_array_elements(selection) e)<>jsonb_array_length(selection) THEN
    RAISE EXCEPTION 'Invalid personal cleanup selection' USING ERRCODE='PCA01';
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(selection) LOOP
    SELECT r.hash INTO prior FROM hash_talk.personal_removals r WHERE r.account_id=actor AND r.kind=item->>'kind' AND r.id=(item->>'id')::uuid;
    IF FOUND AND prior IS DISTINCT FROM item->>'hash' THEN RAISE EXCEPTION 'Personal receipt mismatch' USING ERRCODE='PCA01'; END IF;
  END LOOP;
  SELECT coalesce(jsonb_agg(e),'[]') INTO changed FROM jsonb_array_elements(selection) e WHERE NOT EXISTS(
    SELECT 1 FROM hash_talk.personal_removals r WHERE r.account_id=actor AND r.kind=e->>'kind' AND r.id=(e->>'id')::uuid);
  IF changed='[]'::jsonb THEN RETURN NEXT; RETURN; END IF;
  SELECT coalesce(jsonb_agg(e),'[]') INTO private_items FROM jsonb_array_elements(selection) e WHERE e->>'kind'='message';
  IF private_items<>'[]'::jsonb THEN
    SELECT p.bytes,p.operation INTO private_bytes,private_operation FROM hash_talk.prepare_message_removal(
      'clean',actor,private_items,removal_proof,proof_bytes,participants) p;
  END IF;
  PERFORM hash_talk.ensure_personal_cleanup_plan();
  IF private_operation IS NULL AND EXISTS(SELECT 1 FROM pg_temp.hash_talk_removal_plan) THEN
    RAISE EXCEPTION 'Unexpected private cleanup plan' USING ERRCODE='PCA01';
  END IF;
  budget_probe:=coalesce(private_bytes,0)+65536;
  IF budget_probe>67108864 THEN RAISE EXCEPTION 'Personal cleanup exceeds SQL reserve' USING ERRCODE='PCA01'; END IF;
  SELECT id INTO profile_actor FROM hash_talk.public_profiles WHERE account_id=actor;
  FOR item IN SELECT value FROM jsonb_array_elements(changed) WHERE value->>'kind'<>'message' LOOP
    retained:=0; collect_body:=false;
    IF item->>'kind'='vault' THEN
      SELECT * INTO vault_row FROM hash_talk.vault_operations v WHERE v.account_id=actor AND v.id=(item->>'id')::uuid;
      retained:=(vault_row.commit->'block'->>'bytes')::integer;
      IF NOT FOUND OR vault_row.state<>'accepted' OR vault_row.hash IS DISTINCT FROM item->>'hash'
        OR retained IS NULL OR retained NOT BETWEEN 1 AND 3000000 OR vault_row.charge<retained THEN
        RAISE EXCEPTION 'Vault cleanup target mismatch' USING ERRCODE='PCA01';
      END IF;
      INSERT INTO pg_temp.hash_talk_personal_plan(source,id,before_state,after_state)
        VALUES('vault_operations',vault_row.id,to_jsonb(vault_row),to_jsonb(vault_row)||jsonb_build_object('charge',vault_row.charge-retained));
    ELSE
      SELECT * INTO social_row FROM hash_talk.social_messages m WHERE m.id=(item->>'id')::uuid;
      IF NOT FOUND OR social_row.body IS NULL OR profile_actor IS NULL OR profile_actor NOT IN (social_row.sender,social_row.recipient)
        OR social_row.hash IS DISTINCT FROM item->>'hash' THEN
        RAISE EXCEPTION 'Social cleanup target mismatch' USING ERRCODE='PCA01';
      END IF;
      SELECT a.account_id,b.account_id INTO owner_a,owner_b FROM hash_talk.public_profiles a,hash_talk.public_profiles b
        WHERE a.id=social_row.sender AND b.id=social_row.recipient;
      IF owner_a IS NULL OR owner_b IS NULL OR NOT owner_a=ANY(participants) OR NOT owner_b=ANY(participants) THEN
        RAISE EXCEPTION 'Social cleanup owners mismatch' USING ERRCODE='PCA01';
      END IF;
      SELECT EXISTS(SELECT 1 FROM hash_talk.personal_removals r WHERE r.kind='dm-message' AND r.id=social_row.id
        AND r.account_id IN (owner_a,owner_b) AND r.account_id<>actor) INTO collect_body;
      metadata:=hash_talk.social_cleanup_metadata(social_row);
      final_state:=metadata||jsonb_build_object('sender_charge',CASE WHEN social_row.sender=profile_actor THEN 0 ELSE social_row.sender_charge END,
        'recipient_charge',CASE WHEN social_row.recipient=profile_actor THEN 0 ELSE social_row.recipient_charge END);
      IF collect_body THEN final_state:=final_state||jsonb_build_object('available',false,'personal_collected',true,'charge',512); END IF;
      INSERT INTO pg_temp.hash_talk_personal_plan(source,id,before_state,after_state,collect,max_writes)
        VALUES('social_messages',social_row.id,metadata,final_state,collect_body,CASE WHEN collect_body THEN 2 ELSE 1 END);
      IF EXISTS(SELECT 1 FROM hash_talk.social_media m WHERE m.message_id=social_row.id
        AND (m.sender<>social_row.sender OR m.recipient<>social_row.recipient)) THEN
        RAISE EXCEPTION 'Social media owners mismatch' USING ERRCODE='PCA01';
      END IF;
      -- Aggregate indexed metadata before copying any media/receipt history into
      -- the temporary plan. The existing SQL reserve bounds preparation too.
      SELECT coalesce(sum(32*pg_column_size(to_jsonb(m))::bigint+32768),0) INTO media_probe
        FROM hash_talk.social_media m WHERE m.message_id=social_row.id;
      SELECT coalesce(sum(32*pg_column_size(to_jsonb(r))::bigint+16384),0) INTO receipt_probe
        FROM hash_talk.social_receipts r WHERE r.message_id=social_row.id AND r.profile_id=profile_actor;
      budget_probe:=budget_probe+media_probe+receipt_probe+65536;
      IF budget_probe>67108864 THEN RAISE EXCEPTION 'Personal cleanup exceeds SQL reserve' USING ERRCODE='PCA01'; END IF;
      -- File-worker release/collection can bypass contact admission. Freeze the
      -- admitted rows, then read fresh metadata after any row-lock wait.
      PERFORM 1 FROM hash_talk.social_media m WHERE m.message_id=social_row.id ORDER BY m.id FOR UPDATE;
      PERFORM 1 FROM hash_talk.social_receipts r WHERE r.message_id=social_row.id AND r.profile_id=profile_actor
        ORDER BY r.device_id FOR UPDATE;
      INSERT INTO pg_temp.hash_talk_personal_plan(source,id,before_state,after_state,collect,max_writes)
        SELECT 'social_media',m.id,to_jsonb(m),to_jsonb(m)||jsonb_build_object(
          'sender_charge',CASE WHEN m.sender=profile_actor THEN 0 ELSE m.sender_charge END,
          'recipient_charge',CASE WHEN m.recipient=profile_actor THEN 0 ELSE m.recipient_charge END)
          ||CASE WHEN collect_body AND m.status='accepted' THEN jsonb_build_object('status','deleting','writer',NULL) ELSE '{}'::jsonb END,
          collect_body AND m.status='accepted',CASE WHEN collect_body AND m.status='accepted' THEN 2 ELSE 1 END
        FROM hash_talk.social_media m WHERE m.message_id=social_row.id;
      INSERT INTO pg_temp.hash_talk_personal_plan(source,id,detail,before_state,after_state)
        SELECT 'social_receipts',r.message_id,r.device_id::text,to_jsonb(r),'null'::jsonb
        FROM hash_talk.social_receipts r WHERE r.message_id=social_row.id AND r.profile_id=profile_actor;
    END IF;
    INSERT INTO pg_temp.hash_talk_personal_plan(source,id,before_state,after_state)
      VALUES('root-'||(item->>'kind'),(item->>'id')::uuid,item,jsonb_build_object('account_id',actor,'kind',item->>'kind',
        'id',item->>'id','hash',item->>'hash','proof',removal_proof,'retained_bytes',retained,'charge',retained+proof_bytes+512));
  END LOOP;
  operation:=coalesce(private_operation,(changed->0->>'id')::uuid);
  IF private_operation IS NULL THEN
    SELECT jsonb_build_object(actor::text,coalesce((SELECT revision FROM hash_talk.message_heads WHERE account_id=actor),0)) INTO heads;
    PERFORM set_config('hash_talk.content_removal_heads',heads::text,true);
    PERFORM set_config('hash_talk.content_removal_kind','clean',true);
    PERFORM set_config('hash_talk.content_removal_actor',actor::text,true);
    PERFORM set_config('hash_talk.content_removal_operation',operation::text,true);
    PERFORM set_config('hash_talk.content_removal_proof',removal_proof::text,true);
    PERFORM set_config('hash_talk.content_removal_charge',(proof_bytes+512)::text,true);
  END IF;
  SELECT 65536+coalesce(sum(8*(pg_column_size(before_state)::bigint+pg_column_size(after_state)::bigint+256)),0)
    INTO overhead FROM pg_temp.hash_talk_personal_plan;
  SELECT overhead+coalesce(sum(max_writes::bigint*(8*greatest(pg_column_size(before_state),pg_column_size(after_state))+8192)
    +CASE WHEN source LIKE 'root-%' THEN proof_bytes+512 ELSE 0 END),0) INTO extra_bytes FROM pg_temp.hash_talk_personal_plan;
  IF private_operation IS NULL THEN
    SELECT extra_bytes+65536+coalesce(sum(4*pg_column_size(c)::bigint+4096),0) INTO extra_bytes
      FROM hash_talk.message_changes c WHERE c.account_id=actor AND c.revision<=(heads->>actor::text)::bigint+1-256;
  END IF;
  bytes:=coalesce(private_bytes,0)+extra_bytes;
  IF bytes>67108864 THEN RAISE EXCEPTION 'Personal cleanup exceeds SQL reserve' USING ERRCODE='PCA01'; END IF;
  PERFORM set_config('hash_talk.content_consumed',(coalesce(nullif(current_setting('hash_talk.content_consumed',true),''),'0')::bigint+overhead)::text,true);
  PERFORM set_config('hash_talk.content_personal_profile',coalesce(profile_actor::text,''),true);
  PERFORM set_config('hash_talk.content_personal_private',(private_operation IS NOT NULL)::text,true);
  RETURN NEXT;
END;
$$;

CREATE FUNCTION hash_talk.consume_personal_cleanup(source_name text,before_row jsonb,after_row jsonb,action text,cost bigint)
  RETURNS void LANGUAGE plpgsql AS $$
DECLARE plan record; selected uuid; detail_key text:=''; allowed boolean:=false; intermediate jsonb;
  profile_actor text:=current_setting('hash_talk.content_personal_profile',true);
BEGIN
  IF profile_actor IS DISTINCT FROM coalesce((SELECT id::text FROM hash_talk.public_profiles
    WHERE account_id=nullif(current_setting('hash_talk.content_account',true),'')::uuid),'') THEN
    RAISE EXCEPTION 'Personal cleanup profile binding mismatch' USING ERRCODE='PCA01';
  END IF;
  selected:=(coalesce(after_row,before_row)->>CASE WHEN source_name='social_receipts' THEN 'message_id' ELSE 'id' END)::uuid;
  IF source_name='social_receipts' THEN detail_key:=before_row->>'device_id'; END IF;
  IF source_name='personal_removals' THEN
    SELECT * INTO plan FROM pg_temp.hash_talk_personal_plan p WHERE p.source='root-'||(after_row->>'kind') AND p.id=selected AND p.detail='';
    allowed:=FOUND AND action='INSERT' AND plan.writes=0 AND after_row-'sequence'=plan.after_state;
    -- Retained file bytes already exist. Only proof/receipt metadata spends SQL credit.
    cost:=cost+(after_row->>'charge')::bigint-(after_row->>'retained_bytes')::bigint;
  ELSE
    SELECT * INTO plan FROM pg_temp.hash_talk_personal_plan p WHERE p.source=source_name AND p.id=selected AND p.detail=detail_key;
    IF NOT FOUND OR plan.writes>=plan.max_writes THEN RAISE EXCEPTION 'Personal cleanup source mismatch' USING ERRCODE='PCA01'; END IF;
    CASE source_name
      WHEN 'vault_operations' THEN allowed:=action='UPDATE' AND plan.writes=0 AND before_row=plan.before_state AND after_row=plan.after_state;
      WHEN 'social_receipts' THEN allowed:=action='DELETE' AND plan.writes=0 AND before_row=plan.before_state;
      WHEN 'social_media','social_messages' THEN
        intermediate:=plan.before_state||jsonb_build_object(
          'sender_charge',CASE WHEN plan.before_state->>'sender'=profile_actor THEN 0 ELSE (plan.before_state->>'sender_charge')::integer END,
          'recipient_charge',CASE WHEN plan.before_state->>'recipient'=profile_actor THEN 0 ELSE (plan.before_state->>'recipient_charge')::integer END);
        allowed:=action='UPDATE' AND ((plan.writes=0 AND before_row=plan.before_state AND after_row=intermediate)
          OR (plan.writes=1 AND plan.collect AND before_row=intermediate AND after_row=plan.after_state));
        IF allowed AND plan.writes=1 THEN
          allowed:=EXISTS(SELECT 1 FROM hash_talk.social_messages m
            JOIN hash_talk.public_profiles sender ON sender.id=m.sender
            JOIN hash_talk.public_profiles recipient ON recipient.id=m.recipient
            WHERE m.id=CASE WHEN source_name='social_messages' THEN selected ELSE (before_row->>'message_id')::uuid END
              AND (SELECT count(*) FROM hash_talk.personal_removals r WHERE r.kind='dm-message' AND r.id=m.id
                AND r.account_id IN (sender.account_id,recipient.account_id))=2
              AND (source_name='social_messages' OR (m.body IS NULL AND m.personal_collected)));
        END IF;
      ELSE NULL;
    END CASE;
  END IF;
  IF allowed IS DISTINCT FROM true THEN RAISE EXCEPTION 'Unsupported personal cleanup effect' USING ERRCODE='PCA01'; END IF;
  PERFORM hash_talk.consume_message_removal_cost(cost);
  UPDATE pg_temp.hash_talk_personal_plan SET writes=writes+1 WHERE source=plan.source AND id=plan.id AND detail=plan.detail;
END;
$$;

CREATE FUNCTION hash_talk.consume_personal_social(before_row hash_talk.social_messages,after_row hash_talk.social_messages)
  RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF before_row.body IS DISTINCT FROM after_row.body AND after_row.body IS NOT NULL THEN
    RAISE EXCEPTION 'Personal cleanup cannot change ciphertext' USING ERRCODE='PCA01';
  END IF;
  PERFORM hash_talk.consume_personal_cleanup('social_messages',hash_talk.social_cleanup_metadata(before_row),hash_talk.social_cleanup_metadata(after_row),'UPDATE',
    4*(pg_column_size(hash_talk.social_cleanup_metadata(before_row))::bigint+pg_column_size(hash_talk.social_cleanup_metadata(after_row))::bigint)+4096);
END;
$$;

CREATE FUNCTION hash_talk.assert_personal_cleanup_complete() RETURNS void LANGUAGE plpgsql AS $$
DECLARE plan record; actual jsonb; actor uuid:=nullif(current_setting('hash_talk.content_account',true),'')::uuid;
  profile_actor uuid:=nullif(current_setting('hash_talk.content_personal_profile',true),'')::uuid;
BEGIN
  IF current_setting('hash_talk.content_removal_kind',true) IS DISTINCT FROM 'clean'
    OR hash_talk.active_content_allocation() IS NULL OR NOT EXISTS(SELECT 1 FROM hash_talk.content_allocations
    WHERE transaction_id=pg_current_xact_id() AND scope='personal-clean') OR to_regclass('pg_temp.hash_talk_personal_plan') IS NULL THEN
    RAISE EXCEPTION 'Personal cleanup allocation unavailable' USING ERRCODE='PCA01';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_temp.hash_talk_personal_plan WHERE source LIKE 'root-%')
    AND NOT EXISTS(SELECT 1 FROM pg_temp.hash_talk_removal_plan WHERE source='root') THEN
    RAISE EXCEPTION 'Personal cleanup selection unavailable' USING ERRCODE='PCA01';
  END IF;
  IF coalesce(profile_actor::text,'') IS DISTINCT FROM coalesce((SELECT id::text FROM hash_talk.public_profiles WHERE account_id=actor),'') THEN
    RAISE EXCEPTION 'Personal cleanup profile binding mismatch' USING ERRCODE='PCA01';
  END IF;
  PERFORM hash_talk.assert_message_removal_complete();
  FOR plan IN SELECT * FROM pg_temp.hash_talk_personal_plan LOOP
    IF plan.writes<>plan.max_writes THEN RAISE EXCEPTION 'Personal cleanup effects incomplete' USING ERRCODE='PCA01'; END IF;
    CASE plan.source
      WHEN 'root-vault','root-dm-message' THEN
        SELECT to_jsonb(r)-'sequence' INTO actual FROM hash_talk.personal_removals r WHERE r.account_id=actor
          AND r.kind=substring(plan.source FROM 6) AND r.id=plan.id;
      WHEN 'vault_operations' THEN SELECT to_jsonb(v) INTO actual FROM hash_talk.vault_operations v WHERE v.account_id=actor AND v.id=plan.id;
      WHEN 'social_messages' THEN SELECT hash_talk.social_cleanup_metadata(m) INTO actual FROM hash_talk.social_messages m WHERE m.id=plan.id;
      WHEN 'social_media' THEN SELECT to_jsonb(m) INTO actual FROM hash_talk.social_media m WHERE m.id=plan.id;
      WHEN 'social_receipts' THEN
        IF EXISTS(SELECT 1 FROM hash_talk.social_receipts r WHERE r.message_id=plan.id AND r.profile_id=profile_actor AND r.device_id::text=plan.detail) THEN
          RAISE EXCEPTION 'Social receipt cleanup incomplete' USING ERRCODE='PCA01';
        END IF;
        actual:='null'::jsonb;
      ELSE RAISE EXCEPTION 'Unknown personal cleanup source' USING ERRCODE='PCA01';
    END CASE;
    IF actual IS DISTINCT FROM plan.after_state THEN RAISE EXCEPTION 'Personal cleanup final state mismatch' USING ERRCODE='PCA01'; END IF;
  END LOOP;
  IF NOT EXISTS(SELECT 1 FROM hash_talk.content_usage WHERE singleton) OR NOT EXISTS(SELECT 1 FROM hash_talk.content_usage_partitions
    WHERE id=nullif(current_setting('hash_talk.content_partition',true),'')::bigint) THEN RAISE EXCEPTION 'Global accounting unavailable'; END IF;
END;
$$;

DO $$
DECLARE definition text; needle text;
BEGIN
  definition:=pg_get_functiondef('hash_talk.active_content_allocation()'::regprocedure);
  needle:='scope IN (''vault-reserve'',''vault-maintain'',''message-admit'',''message-read'',''message-remove'',''message-open'')';
  IF (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Unexpected personal scope definition'; END IF;
  EXECUTE replace(definition,needle,'scope IN (''vault-reserve'',''vault-maintain'',''message-admit'',''message-read'',''message-remove'',''message-open'',''personal-clean'')');
  definition:=pg_get_functiondef('hash_talk.assert_message_removal_complete()'::regprocedure);
  needle:='scope=''message-remove''';
  IF (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Unexpected removal completeness scope'; END IF;
  definition:=replace(definition,needle,'scope IN (''message-remove'',''personal-clean'')');
  needle:='IF NOT EXISTS(SELECT 1 FROM pg_temp.hash_talk_removal_plan WHERE source=''message_packets'') OR EXISTS(';
  IF (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Unexpected removal completeness packets'; END IF;
  EXECUTE replace(definition,needle,$body$IF (NOT EXISTS(SELECT 1 FROM pg_temp.hash_talk_removal_plan WHERE source='message_packets')
    AND NOT EXISTS(SELECT 1 FROM hash_talk.content_allocations WHERE transaction_id=pg_current_xact_id() AND scope='personal-clean'
      AND current_setting('hash_talk.content_personal_private',true)='false')) OR EXISTS($body$);
  definition:=pg_get_functiondef('hash_talk.enforce_allocated_source()'::regprocedure);
  needle:='IF EXISTS(SELECT 1 FROM hash_talk.content_allocations WHERE transaction_id=pg_current_xact_id() AND scope=''message-open'') THEN';
  IF (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Unexpected personal source definition'; END IF;
  EXECUTE replace(definition,needle,$body$
  IF EXISTS(SELECT 1 FROM hash_talk.content_allocations WHERE transaction_id=pg_current_xact_id() AND scope='personal-clean') THEN
    IF current_setting('hash_talk.content_removal_kind',true) IS DISTINCT FROM 'clean' THEN
      RAISE EXCEPTION 'Personal cleanup kind mismatch' USING ERRCODE='PCA01';
    END IF;
    IF TG_TABLE_NAME='message_packets' AND TG_OP='UPDATE' THEN
      PERFORM hash_talk.consume_message_removal_packet(OLD,NEW);
    ELSIF TG_TABLE_NAME='social_messages' AND TG_OP='UPDATE' THEN
      PERFORM hash_talk.consume_personal_social(OLD,NEW);
    ELSIF TG_TABLE_NAME IN ('message_references','message_reads','message_attachments','message_heads','message_changes')
      OR (TG_TABLE_NAME='personal_removals' AND TG_OP='INSERT' AND to_jsonb(NEW)->>'kind'='message') THEN
      PERFORM hash_talk.consume_message_removal_metadata(TG_TABLE_NAME,
        CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END,CASE WHEN TG_OP='DELETE' THEN NULL ELSE to_jsonb(NEW) END,TG_OP,
        4*(CASE WHEN TG_OP='INSERT' THEN 0 ELSE pg_column_size(OLD)::bigint END+CASE WHEN TG_OP='DELETE' THEN 0 ELSE pg_column_size(NEW)::bigint END)
        +CASE WHEN TG_OP='DELETE' AND TG_TABLE_NAME IN ('message_references','message_reads') THEN 512 ELSE 4096 END
        +CASE WHEN TG_OP='INSERT' AND TG_TABLE_NAME IN ('personal_removals','message_changes') THEN (to_jsonb(NEW)->>'charge')::bigint ELSE 0 END);
    ELSIF TG_TABLE_NAME IN ('vault_operations','social_media','social_receipts','personal_removals') THEN
      PERFORM hash_talk.consume_personal_cleanup(TG_TABLE_NAME,
        CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END,CASE WHEN TG_OP='DELETE' THEN NULL ELSE to_jsonb(NEW) END,TG_OP,
        4*(CASE WHEN TG_OP='INSERT' THEN 0 ELSE pg_column_size(OLD)::bigint END+CASE WHEN TG_OP='DELETE' THEN 0 ELSE pg_column_size(NEW)::bigint END)+4096);
    ELSE RAISE EXCEPTION 'Unsupported personal cleanup source' USING ERRCODE='PCA01'; END IF;
    IF TG_OP='DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF EXISTS(SELECT 1 FROM hash_talk.content_allocations WHERE transaction_id=pg_current_xact_id() AND scope='message-open') THEN$body$);
END;
$$;
