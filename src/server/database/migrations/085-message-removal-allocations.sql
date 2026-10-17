-- Prepared private removals only. No source conversion/backfill, reset or activation.
ALTER TABLE hash_talk.content_allocations DROP CONSTRAINT content_allocations_scope_check;
ALTER TABLE hash_talk.content_allocations ADD CONSTRAINT content_allocations_scope_check
  CHECK(scope IN ('prepared','vault-reserve','vault-maintain','message-admit','message-read','message-remove'));
ALTER TABLE hash_talk.content_allocations ADD CHECK(scope<>'message-remove' OR bytes<=67108864);

-- Clear the composite's body pointer BEFORE JSON conversion. Presence, identity
-- and charges need metadata, not detoasted ciphertext or a copy sent to Node.
CREATE FUNCTION hash_talk.message_removal_metadata(packet hash_talk.message_packets)
  RETURNS jsonb LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE available boolean:=packet.body IS NOT NULL;
BEGIN
  packet.body:=NULL;
  RETURN (to_jsonb(packet)-'body')||jsonb_build_object('available',available);
END;
$$;

CREATE FUNCTION hash_talk.prepare_message_removal(removal_kind text,actor uuid,selection jsonb,
  removal_proof jsonb,proof_bytes integer,participants uuid[])
  RETURNS TABLE(bytes bigint,operation uuid) LANGUAGE plpgsql AS $$
DECLARE item jsonb; packet hash_talk.message_packets; prior text; roots jsonb:='[]';
  heads jsonb; overhead bigint; count_selected integer;
BEGIN
  IF removal_kind IS NULL OR removal_kind NOT IN ('delete','clean') OR actor IS NULL OR participants IS NULL OR NOT actor=ANY(participants)
    OR current_setting('hash_talk.storage_capacity_mode',true) IS DISTINCT FROM 'volume'
    OR current_setting('transaction_isolation')<>'read committed'
    OR hash_talk.active_content_allocation() IS NOT NULL
    OR coalesce(current_setting('hash_talk.content_removal_kind',true),'')<>''
    OR jsonb_typeof(selection) IS DISTINCT FROM 'array' OR proof_bytes IS NULL OR proof_bytes NOT BETWEEN 1 AND 4096
    OR jsonb_typeof(removal_proof) IS DISTINCT FROM 'object' OR removal_proof->'payload'->>'revision' IS NULL
    OR (removal_proof->'payload'->>'revision')::integer NOT BETWEEN 1 AND 128 THEN
    RAISE EXCEPTION 'Invalid removal preparation' USING ERRCODE='PCA01';
  END IF;
  count_selected:=jsonb_array_length(selection);
  IF count_selected NOT BETWEEN 1 AND 8 OR (removal_kind='delete' AND count_selected<>1)
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(selection) e WHERE e->>'kind' IS DISTINCT FROM 'message')
    OR (SELECT count(DISTINCT e->>'id') FROM jsonb_array_elements(selection) e)<>count_selected THEN
    RAISE EXCEPTION 'Invalid private removal selection' USING ERRCODE='PCA01';
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(selection) LOOP
    IF removal_kind='clean' THEN
      SELECT r.hash INTO prior FROM hash_talk.personal_removals r
        WHERE r.account_id=actor AND r.kind='message' AND r.id=(item->>'id')::uuid;
      IF FOUND THEN
        IF prior IS DISTINCT FROM item->>'hash' THEN RAISE EXCEPTION 'Removal receipt mismatch' USING ERRCODE='PCA01'; END IF;
        CONTINUE;
      END IF;
    END IF;
    SELECT m.* INTO packet FROM hash_talk.message_packets m WHERE m.id=(item->>'id')::uuid;
    IF NOT FOUND OR packet.body IS NULL OR packet.hash IS DISTINCT FROM item->>'hash'
      OR actor NOT IN (packet.sender,packet.recipient)
      OR NOT packet.sender=ANY(participants) OR NOT packet.recipient=ANY(participants)
      OR (removal_kind='delete' AND packet.sender<>actor) THEN
      RAISE EXCEPTION 'Removal target mismatch' USING ERRCODE='PCA01';
    END IF;
    roots:=roots||jsonb_build_array(jsonb_build_object('id',packet.id,'hash',packet.hash,
      'sender',packet.sender,'recipient',packet.recipient,
      'collect',removal_kind='clean' AND EXISTS(SELECT 1 FROM hash_talk.personal_removals r
        WHERE r.kind='message' AND r.id=packet.id AND r.account_id IN (packet.sender,packet.recipient) AND r.account_id<>actor)));
  END LOOP;
  IF roots='[]'::jsonb THEN RETURN NEXT; RETURN; END IF;

  -- One session-local relation, reused across operations; no per-ID catalog/GUC
  -- objects or history growth. COMMIT truncates all plan rows; disconnect drops
  -- the relation. Plan bytes and temporary tuple work belong to the SQL envelope.
  IF to_regclass('pg_temp.hash_talk_removal_plan') IS NULL THEN
    CREATE TEMPORARY TABLE hash_talk_removal_plan (
      source text NOT NULL,id uuid NOT NULL,before_state jsonb NOT NULL,after_state jsonb NOT NULL,
      reference_count integer NOT NULL DEFAULT 0,collect boolean NOT NULL DEFAULT false,
      max_writes integer NOT NULL DEFAULT 1,writes integer NOT NULL DEFAULT 0,
      PRIMARY KEY(source,id)
    ) ON COMMIT DELETE ROWS;
  END IF;
  IF EXISTS(SELECT 1 FROM pg_temp.hash_talk_removal_plan) THEN
    RAISE EXCEPTION 'Removal plan already occupied' USING ERRCODE='PCA01';
  END IF;
  INSERT INTO pg_temp.hash_talk_removal_plan(source,id,before_state,after_state,collect)
    SELECT 'root',(r->>'id')::uuid,r,jsonb_build_object('account_id',actor,'kind','message','id',r->'id',
      'hash',r->'hash','proof',removal_proof,'retained_bytes',0,'charge',proof_bytes+512),(r->>'collect')::boolean
    FROM jsonb_array_elements(roots) r;

  -- Explicit indexed root/related lookups. Each root has at most 64 actions;
  -- the actor and all peers were locked before this bounded snapshot.
  IF EXISTS(SELECT 1 FROM pg_temp.hash_talk_removal_plan r CROSS JOIN LATERAL (
      SELECT m.id,m.sender,m.recipient FROM hash_talk.message_packets m WHERE m.id=r.id
      UNION ALL SELECT m.id,m.sender,m.recipient FROM hash_talk.message_packets m
        WHERE m.relation IS NOT NULL AND m.relation->>'id'=r.id::text
    ) m WHERE r.source='root' AND (m.sender::text NOT IN (r.before_state->>'sender',r.before_state->>'recipient')
      OR m.recipient::text NOT IN (r.before_state->>'sender',r.before_state->>'recipient')
      OR NOT m.sender=ANY(participants) OR NOT m.recipient=ANY(participants)))
    OR EXISTS(SELECT 1 FROM pg_temp.hash_talk_removal_plan r WHERE r.source='root' AND
      (SELECT count(*) FROM hash_talk.message_packets m WHERE m.id=r.id OR (m.relation IS NOT NULL AND m.relation->>'id'=r.id::text))>65) THEN
    RAISE EXCEPTION 'Related removal scope mismatch' USING ERRCODE='PCA01';
  END IF;
  WITH targets AS MATERIALIZED (
    SELECT m.id,count(*)::integer AS coverage,bool_or(r.collect) AS collect
    FROM pg_temp.hash_talk_removal_plan r CROSS JOIN LATERAL (
      SELECT p.id FROM hash_talk.message_packets p WHERE p.id=r.id
      UNION ALL SELECT p.id FROM hash_talk.message_packets p WHERE p.relation IS NOT NULL AND p.relation->>'id'=r.id::text
    ) m WHERE r.source='root' GROUP BY m.id
  ), snapshots AS MATERIALIZED (
    SELECT m.id,m.sender,m.recipient,m.charge,m.sender_charge,m.recipient_charge,m.queue_active,
      m.body IS NOT NULL AS available,t.coverage,t.collect,hash_talk.message_removal_metadata(m) AS metadata,
      (SELECT count(*)::integer FROM hash_talk.message_references ref WHERE ref.message_id=m.id
        AND (removal_kind='delete' OR ref.account_id=actor)) AS refs,
      EXISTS(SELECT 1 FROM hash_talk.message_references ref WHERE ref.message_id=m.id AND ref.account_id<>actor AND ref.status='pending') AS pending
    FROM targets t JOIN hash_talk.message_packets m USING(id)
  ) INSERT INTO pg_temp.hash_talk_removal_plan(source,id,before_state,after_state,reference_count,collect,max_writes)
    SELECT 'message_packets',m.id,m.metadata,
      CASE WHEN removal_kind='delete' THEN
        CASE WHEN NOT m.available THEN m.metadata ELSE m.metadata||jsonb_build_object('available',false,'deletion',removal_proof,
          'queue_active',false,'sender_charge',proof_bytes+512,'recipient_charge',proof_bytes+512,'charge',proof_bytes+512,
          'deletion_revision',removal_proof->'payload'->'revision','deletion_account',actor) END
      ELSE m.metadata||jsonb_build_object('sender_charge',CASE WHEN m.sender=actor THEN 0 ELSE m.sender_charge END,
        'recipient_charge',CASE WHEN m.recipient=actor THEN 0 ELSE m.recipient_charge END,'charge',m.charge-m.refs*256,
        'queue_active',m.queue_active AND m.pending)||CASE WHEN m.collect AND m.available THEN
          jsonb_build_object('available',false,'personal_collected',true,'queue_active',false,'charge',4096) ELSE '{}'::jsonb END END,
      m.refs,m.collect,CASE WHEN removal_kind='delete' THEN CASE WHEN NOT m.available THEN 0 ELSE 1 END
        ELSE m.coverage+CASE WHEN m.refs>0 THEN 1 ELSE 0 END
          +CASE WHEN m.queue_active AND NOT m.pending THEN 1 ELSE 0 END
          +CASE WHEN m.collect AND m.available THEN 1 ELSE 0 END END
    FROM snapshots m;
  IF EXISTS(SELECT 1 FROM hash_talk.message_attachments a JOIN pg_temp.hash_talk_removal_plan r
      ON r.source='root' AND r.id=a.message_id WHERE a.status='accepted' AND (removal_kind='delete' OR r.collect)
      AND (NOT a.sender=ANY(participants) OR NOT a.recipient=ANY(participants)
        OR a.sender::text NOT IN (r.before_state->>'sender',r.before_state->>'recipient')
        OR a.recipient::text NOT IN (r.before_state->>'sender',r.before_state->>'recipient'))) THEN
    RAISE EXCEPTION 'Attachment removal owner mismatch' USING ERRCODE='PCA01';
  END IF;
  INSERT INTO pg_temp.hash_talk_removal_plan(source,id,before_state,after_state)
    SELECT 'message_attachments',a.id,to_jsonb(a),to_jsonb(a)||jsonb_build_object('status','deleting')
    FROM hash_talk.message_attachments a JOIN pg_temp.hash_talk_removal_plan r ON r.source='root' AND r.id=a.message_id
    WHERE a.status='accepted' AND (removal_kind='delete' OR r.collect);
  SELECT jsonb_object_agg(owner::text,coalesce(h.revision,0)) INTO heads FROM (
    SELECT DISTINCT unnest(CASE WHEN removal_kind='delete' THEN participants ELSE ARRAY[actor] END) AS owner
  ) owners LEFT JOIN hash_talk.message_heads h ON h.account_id=owners.owner;
  SELECT 65536+4*sum(pg_column_size(before_state)::bigint+pg_column_size(after_state)::bigint+256)
    INTO overhead FROM pg_temp.hash_talk_removal_plan;
  -- Deletes do not insert index tuples or rewrite payloads. Charge their tuple/
  -- WAL work plus 512 bytes; page images/vacuum remain in the existing DB/WAL
  -- operating reserve. Packet metadata updates and new receipts/journals use the
  -- larger update/insert allowance, including session-plan tuple updates.
  SELECT overhead+65536*(SELECT count(*) FROM jsonb_object_keys(heads))
    +coalesce((SELECT sum(max_writes::bigint*(8*(greatest(pg_column_size(before_state),pg_column_size(after_state))+512)+8192)
      +CASE WHEN source='root' AND removal_kind='clean' THEN proof_bytes+512 ELSE 0 END)
      FROM pg_temp.hash_talk_removal_plan WHERE source<>'root' OR removal_kind='clean'),0)
    +coalesce((SELECT sum(4*pg_column_size(ref)::bigint+512) FROM hash_talk.message_references ref
      JOIN pg_temp.hash_talk_removal_plan p ON p.source='message_packets' AND p.id=ref.message_id
      WHERE removal_kind='delete' OR ref.account_id=actor),0)
    +coalesce((SELECT sum(4*pg_column_size(read)::bigint+512) FROM hash_talk.message_reads read
      JOIN pg_temp.hash_talk_removal_plan p ON p.source='message_packets' AND p.id=read.message_id
      WHERE removal_kind='delete' OR read.account_id=actor),0)
    +coalesce((SELECT sum(4*pg_column_size(change)::bigint+4096) FROM hash_talk.message_changes change
      WHERE heads ? change.account_id::text AND change.revision<=(heads->>change.account_id::text)::bigint+1-256),0)
    INTO bytes;
  operation:=(roots->0->>'id')::uuid;
  PERFORM set_config('hash_talk.content_removal_kind',removal_kind,true);
  PERFORM set_config('hash_talk.content_removal_actor',actor::text,true);
  PERFORM set_config('hash_talk.content_removal_operation',operation::text,true);
  PERFORM set_config('hash_talk.content_removal_heads',heads::text,true);
  PERFORM set_config('hash_talk.content_removal_proof',removal_proof::text,true);
  PERFORM set_config('hash_talk.content_removal_charge',(proof_bytes+512)::text,true);
  PERFORM set_config('hash_talk.content_consumed',overhead::text,true);
  RETURN NEXT;
END;
$$;

CREATE FUNCTION hash_talk.consume_message_removal_cost(cost bigint) RETURNS void LANGUAGE plpgsql AS $$
DECLARE credit bigint:=hash_talk.active_content_allocation(); consumed bigint;
BEGIN
  IF credit IS NULL OR credit>67108864 OR cost<=0
    OR current_setting('hash_talk.content_account',true) IS DISTINCT FROM current_setting('hash_talk.content_removal_actor',true)
    OR current_setting('hash_talk.content_operation',true) IS DISTINCT FROM current_setting('hash_talk.content_removal_operation',true)
    OR coalesce(current_setting('hash_talk.content_removal_kind',true),'') NOT IN ('delete','clean') THEN
    RAISE EXCEPTION 'Removal allocation binding mismatch' USING ERRCODE='PCA01';
  END IF;
  consumed:=coalesce(nullif(current_setting('hash_talk.content_consumed',true),''),'0')::bigint+cost;
  IF consumed>credit THEN RAISE EXCEPTION 'Removal allocation exhausted' USING ERRCODE='PCA01'; END IF;
  PERFORM set_config('hash_talk.content_consumed',consumed::text,true);
END;
$$;

CREATE FUNCTION hash_talk.consume_message_removal_packet(before_row hash_talk.message_packets,after_row hash_talk.message_packets)
  RETURNS void LANGUAGE plpgsql AS $$
DECLARE plan record; before_meta jsonb:=hash_talk.message_removal_metadata(before_row);
  after_meta jsonb:=hash_talk.message_removal_metadata(after_row);
  actor uuid:=current_setting('hash_talk.content_account',true)::uuid;
  kind text:=current_setting('hash_talk.content_removal_kind',true); allowed boolean:=false;
BEGIN
  SELECT * INTO plan FROM pg_temp.hash_talk_removal_plan WHERE source='message_packets' AND id=before_row.id;
  IF NOT FOUND OR plan.writes>=plan.max_writes THEN
    RAISE EXCEPTION 'Packet removal scope mismatch' USING ERRCODE='PCA01';
  END IF;
  IF kind='delete' THEN
    allowed:=before_meta=plan.before_state AND after_meta=plan.after_state AND after_row.body IS NULL;
  ELSIF kind='clean' AND after_row.body IS NOT DISTINCT FROM before_row.body THEN
    allowed:=after_meta=before_meta||jsonb_build_object(
      'sender_charge',CASE WHEN before_row.sender=actor THEN 0 ELSE before_row.sender_charge END,
      'recipient_charge',CASE WHEN before_row.recipient=actor THEN 0 ELSE before_row.recipient_charge END);
    IF plan.reference_count>0 AND before_row.charge=(plan.before_state->>'charge')::integer THEN
      allowed:=allowed OR after_meta=before_meta||jsonb_build_object('charge',before_row.charge-plan.reference_count*256);
    END IF;
    IF before_row.queue_active AND NOT after_row.queue_active AND NOT EXISTS(
      SELECT 1 FROM hash_talk.message_references r WHERE r.message_id=before_row.id AND r.status='pending') THEN
      allowed:=allowed OR after_meta=before_meta||jsonb_build_object('queue_active',false);
    END IF;
  ELSIF kind='clean' AND plan.collect AND before_row.body IS NOT NULL AND after_row.body IS NULL THEN
    allowed:=after_meta=before_meta||jsonb_build_object('available',false,'personal_collected',true,'queue_active',false,'charge',4096)
      AND EXISTS(SELECT 1 FROM pg_temp.hash_talk_removal_plan r WHERE r.source='root' AND r.collect
        AND (r.id=before_row.id OR before_row.relation->>'id'=r.id::text)
        AND (SELECT count(*) FROM hash_talk.personal_removals pr WHERE pr.kind='message' AND pr.id=r.id
          AND pr.account_id::text IN (r.before_state->>'sender',r.before_state->>'recipient'))=2);
  END IF;
  IF allowed IS DISTINCT FROM true THEN RAISE EXCEPTION 'Unsupported packet removal effect' USING ERRCODE='PCA01'; END IF;
  PERFORM hash_talk.consume_message_removal_cost(4*(pg_column_size(before_meta)::bigint+pg_column_size(after_meta)::bigint)+4096);
  UPDATE pg_temp.hash_talk_removal_plan SET writes=writes+1 WHERE source='message_packets' AND id=before_row.id;
END;
$$;

CREATE FUNCTION hash_talk.mark_message_removal(kind text,owner text,maximum integer) RETURNS void LANGUAGE plpgsql AS $$
DECLARE setting text:='hash_talk.content_removal_'||kind; marks jsonb; writes integer;
BEGIN
  marks:=coalesce(nullif(current_setting(setting,true),''),'{}')::jsonb;
  writes:=coalesce((marks->>owner)::integer,0)+1;
  IF writes>maximum THEN RAISE EXCEPTION 'Removal metadata effect repeated' USING ERRCODE='PCA01'; END IF;
  PERFORM set_config(setting,jsonb_set(marks,ARRAY[owner],to_jsonb(writes),true)::text,true);
END;
$$;

CREATE FUNCTION hash_talk.consume_message_removal_metadata(source text,before_row jsonb,after_row jsonb,action text,cost bigint)
  RETURNS void LANGUAGE plpgsql AS $$
DECLARE actor text:=current_setting('hash_talk.content_account',true);
  kind text:=current_setting('hash_talk.content_removal_kind',true);
  heads jsonb:=coalesce(nullif(current_setting('hash_talk.content_removal_heads',true),''),'{}')::jsonb;
  owner text; plan record; allowed boolean:=false; revision bigint; expected_ids jsonb;
BEGIN
  CASE source
    WHEN 'message_references','message_reads' THEN
      SELECT * INTO plan FROM pg_temp.hash_talk_removal_plan WHERE hash_talk_removal_plan.source='message_packets'
        AND id=(before_row->>'message_id')::uuid;
      allowed:=FOUND AND action='DELETE' AND before_row->>'account_id' IN (plan.before_state->>'sender',plan.before_state->>'recipient')
        AND (kind='delete' OR before_row->>'account_id'=actor);
    WHEN 'personal_removals' THEN
      SELECT * INTO plan FROM pg_temp.hash_talk_removal_plan WHERE hash_talk_removal_plan.source='root' AND id=(after_row->>'id')::uuid;
      allowed:=FOUND AND kind='clean' AND action='INSERT' AND after_row-'sequence'=plan.after_state AND plan.writes=0;
      IF allowed THEN UPDATE pg_temp.hash_talk_removal_plan SET writes=1 WHERE hash_talk_removal_plan.source='root' AND id=(after_row->>'id')::uuid; END IF;
    WHEN 'message_attachments' THEN
      SELECT * INTO plan FROM pg_temp.hash_talk_removal_plan WHERE hash_talk_removal_plan.source='message_attachments' AND id=(before_row->>'id')::uuid;
      allowed:=FOUND AND action='UPDATE' AND before_row=plan.before_state AND after_row=plan.after_state AND plan.writes=0;
      IF allowed THEN UPDATE pg_temp.hash_talk_removal_plan SET writes=1 WHERE hash_talk_removal_plan.source='message_attachments' AND id=(before_row->>'id')::uuid; END IF;
    WHEN 'message_heads' THEN
      owner:=after_row->>'account_id'; revision:=(heads->>owner)::bigint+1;
      allowed:=heads ? owner AND ((action='INSERT' AND (after_row->>'revision')::bigint=1)
        OR (action='UPDATE' AND (before_row-'revision')=(after_row-'revision') AND (after_row->>'revision')::bigint=revision
          AND (before_row->>'revision')::bigint=revision-1));
      IF allowed THEN PERFORM hash_talk.mark_message_removal('head_writes',owner,2); END IF;
    WHEN 'message_changes' THEN
      owner:=coalesce(after_row,before_row)->>'account_id'; revision:=(heads->>owner)::bigint+1;
      allowed:=heads ? owner AND coalesce(nullif(current_setting('hash_talk.content_removal_head_writes',true),''),'{}')::jsonb ? owner;
      IF action='INSERT' THEN
        SELECT coalesce(jsonb_agg(id::text ORDER BY id),'[]') INTO expected_ids FROM pg_temp.hash_talk_removal_plan
          WHERE hash_talk_removal_plan.source='message_packets' AND (before_state->>'available')::boolean;
        allowed:=allowed AND (after_row->>'revision')::bigint=revision AND
          CASE WHEN kind='clean' THEN after_row->'ids'='null'::jsonb AND (after_row->>'charge')::integer=512
          ELSE (SELECT jsonb_agg(value ORDER BY value) FROM jsonb_array_elements(after_row->'ids'))=expected_ids
            AND (after_row->>'charge')::integer=512+16*jsonb_array_length(expected_ids) END;
        IF allowed THEN PERFORM hash_talk.mark_message_removal('journals',owner,1); END IF;
      ELSE
        allowed:=allowed AND action='DELETE' AND (before_row->>'revision')::bigint<=revision-256
          AND coalesce(nullif(current_setting('hash_talk.content_removal_journals',true),''),'{}')::jsonb ? owner;
      END IF;
    ELSE NULL;
  END CASE;
  IF allowed IS DISTINCT FROM true THEN RAISE EXCEPTION 'Unsupported removal metadata effect' USING ERRCODE='PCA01'; END IF;
  PERFORM hash_talk.consume_message_removal_cost(cost);
END;
$$;

CREATE FUNCTION hash_talk.assert_message_removal_complete() RETURNS void LANGUAGE plpgsql AS $$
DECLARE kind text:=current_setting('hash_talk.content_removal_kind',true);
  actor text:=current_setting('hash_talk.content_account',true);
  heads jsonb:=coalesce(nullif(current_setting('hash_talk.content_removal_heads',true),''),'{}')::jsonb;
  expected_ids jsonb; owner text; baseline jsonb; valid boolean;
BEGIN
  IF hash_talk.active_content_allocation() IS NULL OR NOT EXISTS(SELECT 1 FROM hash_talk.content_allocations
      WHERE transaction_id=pg_current_xact_id() AND scope='message-remove') OR coalesce(kind,'') NOT IN ('delete','clean')
    OR to_regclass('pg_temp.hash_talk_removal_plan') IS NULL THEN
    RAISE EXCEPTION 'Removal allocation unavailable' USING ERRCODE='PCA01';
  END IF;
  PERFORM hash_talk.consume_message_removal_cost(1);
  IF NOT EXISTS(SELECT 1 FROM pg_temp.hash_talk_removal_plan WHERE source='message_packets') OR EXISTS(
    SELECT 1 FROM pg_temp.hash_talk_removal_plan p LEFT JOIN hash_talk.message_packets m ON m.id=p.id
    WHERE p.source='message_packets' AND (m.id IS NULL OR hash_talk.message_removal_metadata(m) IS DISTINCT FROM p.after_state)) THEN
    RAISE EXCEPTION 'Packet removal incomplete' USING ERRCODE='PCA01';
  END IF;
  IF EXISTS(SELECT 1 FROM hash_talk.message_references r JOIN pg_temp.hash_talk_removal_plan p
      ON p.source='message_packets' AND p.id=r.message_id WHERE kind='delete' OR r.account_id::text=actor)
    OR EXISTS(SELECT 1 FROM hash_talk.message_reads r JOIN pg_temp.hash_talk_removal_plan p
      ON p.source='message_packets' AND p.id=r.message_id WHERE kind='delete' OR r.account_id::text=actor) THEN
    RAISE EXCEPTION 'Removal references or reads incomplete' USING ERRCODE='PCA01';
  END IF;
  IF EXISTS(SELECT 1 FROM pg_temp.hash_talk_removal_plan p LEFT JOIN hash_talk.message_attachments a ON a.id=p.id
      WHERE p.source='message_attachments' AND (p.writes<>1 OR to_jsonb(a) IS DISTINCT FROM p.after_state)) THEN
    RAISE EXCEPTION 'Attachment removal incomplete' USING ERRCODE='PCA01';
  END IF;
  IF kind='clean' AND EXISTS(SELECT 1 FROM pg_temp.hash_talk_removal_plan p LEFT JOIN hash_talk.personal_removals r
      ON r.account_id::text=actor AND r.kind='message' AND r.id=p.id
      WHERE p.source='root' AND (p.writes<>1 OR to_jsonb(r)-'sequence' IS DISTINCT FROM p.after_state)) THEN
    RAISE EXCEPTION 'Personal removal receipts incomplete' USING ERRCODE='PCA01';
  END IF;
  SELECT coalesce(jsonb_agg(id::text ORDER BY id),'[]') INTO expected_ids FROM pg_temp.hash_talk_removal_plan
    WHERE source='message_packets' AND (before_state->>'available')::boolean;
  FOR owner,baseline IN SELECT key,value FROM jsonb_each(heads) LOOP
    SELECT EXISTS(SELECT 1 FROM hash_talk.message_heads h JOIN hash_talk.message_changes c USING(account_id,revision)
      WHERE h.account_id::text=owner AND h.revision=baseline::text::bigint+1
        AND CASE WHEN kind='clean' THEN c.ids IS NULL AND c.charge=512 ELSE
          (SELECT jsonb_agg(value ORDER BY value) FROM jsonb_array_elements(to_jsonb(c.ids)))=expected_ids AND c.charge=512+16*jsonb_array_length(expected_ids) END
        AND coalesce(nullif(current_setting('hash_talk.content_removal_journals',true),''),'{}')::jsonb ? owner) INTO valid;
    IF valid IS DISTINCT FROM true OR EXISTS(SELECT 1 FROM hash_talk.message_changes
        WHERE account_id::text=owner AND revision<=baseline::text::bigint+1-256) THEN
      RAISE EXCEPTION 'Removal change checkpoint incomplete' USING ERRCODE='PCA01';
    END IF;
  END LOOP;
END;
$$;

DO $$
DECLARE definition text; needle text;
BEGIN
  definition:=pg_get_functiondef('hash_talk.active_content_allocation()'::regprocedure);
  needle:='scope IN (''vault-reserve'',''vault-maintain'',''message-admit'',''message-read'')';
  IF (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 THEN
    RAISE EXCEPTION 'Unexpected allocation scope definition';
  END IF;
  EXECUTE replace(definition,needle,'scope IN (''vault-reserve'',''vault-maintain'',''message-admit'',''message-read'',''message-remove'')');
  definition:=pg_get_functiondef('hash_talk.enforce_allocated_source()'::regprocedure);
  needle:='IF EXISTS(SELECT 1 FROM hash_talk.content_allocations WHERE transaction_id=pg_current_xact_id() AND scope=''message-read'') THEN';
  IF (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 THEN
    RAISE EXCEPTION 'Unexpected allocation source definition';
  END IF;
  EXECUTE replace(definition,needle,$body$
  IF EXISTS(SELECT 1 FROM hash_talk.content_allocations WHERE transaction_id=pg_current_xact_id() AND scope='message-remove') THEN
    IF TG_TABLE_NAME='message_packets' THEN
      IF TG_OP<>'UPDATE' THEN RAISE EXCEPTION 'Unsupported removal packet source' USING ERRCODE='PCA01'; END IF;
      PERFORM hash_talk.consume_message_removal_packet(OLD,NEW);
    ELSE
      PERFORM hash_talk.consume_message_removal_metadata(TG_TABLE_NAME,
        CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END,
        CASE WHEN TG_OP='DELETE' THEN NULL ELSE to_jsonb(NEW) END,TG_OP,
        4*(CASE WHEN TG_OP='INSERT' THEN 0 ELSE pg_column_size(OLD)::bigint END
          +CASE WHEN TG_OP='DELETE' THEN 0 ELSE pg_column_size(NEW)::bigint END)
          +CASE WHEN TG_OP='DELETE' AND TG_TABLE_NAME IN ('message_references','message_reads') THEN 512 ELSE 4096 END
          +CASE WHEN TG_OP='INSERT' AND TG_TABLE_NAME IN ('personal_removals','message_changes') THEN (to_jsonb(NEW)->>'charge')::bigint ELSE 0 END);
    END IF;
    IF TG_OP='DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF EXISTS(SELECT 1 FROM hash_talk.content_allocations WHERE transaction_id=pg_current_xact_id() AND scope='message-read') THEN$body$);
END;
$$;
