-- Source preparation only. No history conversion, reset or VPS activation.
ALTER TABLE hash_talk.content_allocations DROP CONSTRAINT content_allocations_scope_check;
ALTER TABLE hash_talk.content_allocations ADD CONSTRAINT content_allocations_scope_check
  CHECK(scope IN ('prepared','vault-reserve','vault-maintain','message-admit','message-read','message-remove','message-open'));

CREATE FUNCTION hash_talk.prepare_message_opening(actor uuid,device uuid,ids uuid[],participants uuid[])
  RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE metadata jsonb; packet hash_talk.message_packets; selected uuid; bytes bigint;
BEGIN
  IF actor IS NULL OR device IS NULL OR participants IS NULL OR NOT actor=ANY(participants)
    OR ids IS NULL OR cardinality(ids) NOT BETWEEN 1 AND 32
    OR (SELECT count(DISTINCT id) FROM unnest(ids) id)<>cardinality(ids)
    OR current_setting('hash_talk.storage_capacity_mode',true) IS DISTINCT FROM 'volume'
    OR current_setting('transaction_isolation')<>'read committed'
    OR hash_talk.active_content_allocation() IS NOT NULL
    OR coalesce(current_setting('hash_talk.content_open_device',true),'')<>'' THEN
    RAISE EXCEPTION 'Invalid opening preparation' USING ERRCODE='PCA01';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM hash_talk.device_directories d,jsonb_array_elements(d.event->'devices') member
    WHERE d.account_id=actor AND member->>'id'=device::text) THEN
    RAISE EXCEPTION 'Opening device unavailable' USING ERRCODE='PCA01';
  END IF;
  IF to_regclass('pg_temp.hash_talk_opening_plan') IS NULL THEN
    CREATE TEMPORARY TABLE hash_talk_opening_plan (
      id uuid PRIMARY KEY,owner_account uuid NOT NULL,owner_device uuid NOT NULL,root_operation uuid NOT NULL,before_state jsonb NOT NULL,reference_writes integer NOT NULL DEFAULT 0,
      packet_writes integer NOT NULL DEFAULT 0
    ) ON COMMIT DELETE ROWS;
  END IF;
  IF EXISTS(SELECT 1 FROM pg_temp.hash_talk_opening_plan) THEN
    RAISE EXCEPTION 'Opening plan already occupied' USING ERRCODE='PCA01';
  END IF;
  FOREACH selected IN ARRAY ids LOOP
    SELECT m.* INTO packet FROM hash_talk.message_packets m WHERE m.id=selected;
    IF NOT FOUND OR packet.body IS NULL OR actor NOT IN (packet.sender,packet.recipient)
      OR NOT packet.sender=ANY(participants) OR NOT packet.recipient=ANY(participants)
      OR EXISTS(SELECT 1 FROM hash_talk.message_references r WHERE r.message_id=selected AND r.account_id=actor AND r.device_id=device)
      OR EXISTS(SELECT 1 FROM hash_talk.personal_removals pr WHERE pr.account_id=actor AND pr.kind='message'
        AND pr.id IN (selected,coalesce((packet.relation->>'id')::uuid,selected))) THEN
      RAISE EXCEPTION 'Opening target mismatch' USING ERRCODE='PCA01';
    END IF;
    metadata:=hash_talk.message_removal_metadata(packet);
    INSERT INTO pg_temp.hash_talk_opening_plan(id,owner_account,owner_device,root_operation,before_state) VALUES(selected,actor,device,ids[1],metadata);
  END LOOP;
  -- Existing payload/TOAST pointers are retained. Reserve concrete metadata,
  -- plan/index/WAL overhead and the 256-byte growth, never another payload copy.
  SELECT 65536+sum(32*pg_column_size(before_state)::bigint+32768) INTO bytes FROM pg_temp.hash_talk_opening_plan;
  PERFORM set_config('hash_talk.content_open_device',device::text,true);
  RETURN bytes;
END;
$$;

CREATE FUNCTION hash_talk.consume_message_opening_cost(cost bigint) RETURNS void LANGUAGE plpgsql AS $$
DECLARE consumed bigint:=coalesce(nullif(current_setting('hash_talk.content_consumed',true),''),'0')::bigint+cost;
BEGIN
  IF cost<=0 OR hash_talk.active_content_allocation() IS NULL OR consumed>hash_talk.active_content_allocation() THEN
    RAISE EXCEPTION 'Opening envelope exhausted' USING ERRCODE='PCA01';
  END IF;
  PERFORM set_config('hash_talk.content_consumed',consumed::text,true);
END;
$$;

CREATE FUNCTION hash_talk.consume_message_opening_packet(before_row hash_talk.message_packets,after_row hash_talk.message_packets)
  RETURNS void LANGUAGE plpgsql AS $$
DECLARE plan record; before_meta jsonb; after_meta jsonb;
BEGIN
  IF to_regclass('pg_temp.hash_talk_opening_plan') IS NULL THEN
    RAISE EXCEPTION 'Opening plan unavailable' USING ERRCODE='PCA01';
  END IF;
  SELECT * INTO plan FROM pg_temp.hash_talk_opening_plan WHERE id=before_row.id;
  before_meta:=hash_talk.message_removal_metadata(before_row);
  after_meta:=hash_talk.message_removal_metadata(after_row);
  IF NOT FOUND OR plan.packet_writes<>0 OR plan.reference_writes<>1
    OR plan.owner_account::text IS DISTINCT FROM current_setting('hash_talk.content_account',true)
    OR plan.owner_device::text IS DISTINCT FROM current_setting('hash_talk.content_open_device',true)
    OR plan.root_operation::text IS DISTINCT FROM current_setting('hash_talk.content_operation',true)
    OR before_meta IS DISTINCT FROM plan.before_state
    OR after_meta IS DISTINCT FROM before_meta||jsonb_build_object('charge',before_row.charge+256)
    OR after_row.body IS DISTINCT FROM before_row.body THEN
    RAISE EXCEPTION 'Unsupported opening packet effect' USING ERRCODE='PCA01';
  END IF;
  PERFORM hash_talk.consume_message_opening_cost(4*(pg_column_size(before_meta)::bigint+pg_column_size(after_meta)::bigint)+4096);
  UPDATE pg_temp.hash_talk_opening_plan SET packet_writes=1 WHERE id=before_row.id;
END;
$$;

CREATE FUNCTION hash_talk.consume_message_opening_reference(after_row hash_talk.message_references)
  RETURNS void LANGUAGE plpgsql AS $$
DECLARE actor uuid:=nullif(current_setting('hash_talk.content_account',true),'')::uuid;
  device uuid:=nullif(current_setting('hash_talk.content_open_device',true),'')::uuid;
  plan record;
BEGIN
  IF to_regclass('pg_temp.hash_talk_opening_plan') IS NULL THEN
    RAISE EXCEPTION 'Opening plan unavailable' USING ERRCODE='PCA01';
  END IF;
  SELECT * INTO plan FROM pg_temp.hash_talk_opening_plan WHERE id=after_row.message_id;
  IF NOT FOUND OR plan.reference_writes<>0 OR plan.packet_writes<>0
    OR plan.owner_account IS DISTINCT FROM actor OR plan.owner_device IS DISTINCT FROM device
    OR plan.root_operation::text IS DISTINCT FROM current_setting('hash_talk.content_operation',true)
    OR after_row.account_id IS DISTINCT FROM actor OR after_row.device_id IS DISTINCT FROM device
    OR after_row.status<>'pending'
    OR NOT EXISTS(SELECT 1 FROM hash_talk.message_packets m WHERE m.id=after_row.message_id
      AND hash_talk.message_removal_metadata(m)=plan.before_state AND actor IN (m.sender,m.recipient)) THEN
    RAISE EXCEPTION 'Unsupported opening reference effect' USING ERRCODE='PCA01';
  END IF;
  PERFORM hash_talk.consume_message_opening_cost(4*pg_column_size(after_row)::bigint+4096+256);
  UPDATE pg_temp.hash_talk_opening_plan SET reference_writes=1 WHERE id=after_row.message_id;
END;
$$;

CREATE FUNCTION hash_talk.assert_message_opening_complete() RETURNS void LANGUAGE plpgsql AS $$
DECLARE actor uuid:=nullif(current_setting('hash_talk.content_account',true),'')::uuid;
  device uuid:=nullif(current_setting('hash_talk.content_open_device',true),'')::uuid;
BEGIN
  IF hash_talk.active_content_allocation() IS NULL OR NOT EXISTS(SELECT 1 FROM hash_talk.content_allocations
    WHERE transaction_id=pg_current_xact_id() AND scope='message-open')
    OR to_regclass('pg_temp.hash_talk_opening_plan') IS NULL THEN
    RAISE EXCEPTION 'Opening allocation unavailable' USING ERRCODE='PCA01';
  END IF;
  IF (SELECT count(*) FROM pg_temp.hash_talk_opening_plan) NOT BETWEEN 1 AND 32 OR EXISTS(
    SELECT 1 FROM pg_temp.hash_talk_opening_plan p
    LEFT JOIN hash_talk.message_packets m ON m.id=p.id
    LEFT JOIN hash_talk.message_references r ON r.message_id=p.id AND r.account_id=actor AND r.device_id=device
    WHERE p.owner_account IS DISTINCT FROM actor OR p.owner_device IS DISTINCT FROM device
      OR p.root_operation::text IS DISTINCT FROM current_setting('hash_talk.content_operation',true)
      OR p.reference_writes<>1 OR p.packet_writes<>1 OR m.id IS NULL OR r.status IS DISTINCT FROM 'pending'
      OR hash_talk.message_removal_metadata(m) IS DISTINCT FROM p.before_state||jsonb_build_object('charge',(p.before_state->>'charge')::integer+256)) THEN
    RAISE EXCEPTION 'Opening effects incomplete' USING ERRCODE='PCA01';
  END IF;
  PERFORM hash_talk.consume_message_opening_cost(1);
  IF NOT EXISTS(SELECT 1 FROM hash_talk.content_usage WHERE singleton) OR NOT EXISTS(SELECT 1 FROM hash_talk.content_usage_partitions
    WHERE id=nullif(current_setting('hash_talk.content_partition',true),'')::bigint) THEN
    RAISE EXCEPTION 'Global accounting unavailable';
  END IF;
END;
$$;

DO $$
DECLARE definition text; needle text;
BEGIN
  definition:=pg_get_functiondef('hash_talk.active_content_allocation()'::regprocedure);
  needle:='scope IN (''vault-reserve'',''vault-maintain'',''message-admit'',''message-read'',''message-remove'')';
  IF (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 THEN
    RAISE EXCEPTION 'Unexpected opening allocation scope definition';
  END IF;
  EXECUTE replace(definition,needle,'scope IN (''vault-reserve'',''vault-maintain'',''message-admit'',''message-read'',''message-remove'',''message-open'')');
  definition:=pg_get_functiondef('hash_talk.enforce_allocated_source()'::regprocedure);
  needle:='IF EXISTS(SELECT 1 FROM hash_talk.content_allocations WHERE transaction_id=pg_current_xact_id() AND scope=''message-remove'') THEN';
  IF (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 THEN
    RAISE EXCEPTION 'Unexpected opening source definition';
  END IF;
  EXECUTE replace(definition,needle,$body$
  IF EXISTS(SELECT 1 FROM hash_talk.content_allocations WHERE transaction_id=pg_current_xact_id() AND scope='message-open') THEN
    IF TG_TABLE_NAME='message_packets' AND TG_OP='UPDATE' THEN
      PERFORM hash_talk.consume_message_opening_packet(OLD,NEW);
    ELSIF TG_TABLE_NAME='message_references' AND TG_OP='INSERT' THEN
      PERFORM hash_talk.consume_message_opening_reference(NEW);
    ELSE
      RAISE EXCEPTION 'Unsupported opening source' USING ERRCODE='PCA01';
    END IF;
    RETURN NEW;
  END IF;
  IF EXISTS(SELECT 1 FROM hash_talk.content_allocations WHERE transaction_id=pg_current_xact_id() AND scope='message-remove') THEN$body$);
END;
$$;
