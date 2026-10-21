-- Separate destructive changes from immutable arrival. Existing journal entries
-- remain unknown and force conservative recovery; message bodies are unchanged.
ALTER TABLE hash_talk.message_heads ADD COLUMN invalidation_revision bigint NOT NULL DEFAULT 0
  CHECK(invalidation_revision BETWEEN 0 AND revision);
ALTER TABLE hash_talk.message_changes ADD COLUMN change_kind text NOT NULL DEFAULT 'legacy'
  CHECK(change_kind IN ('legacy','append','remove','reset'));

DO $$
DECLARE definition text; needle text;
BEGIN
  definition:=pg_get_functiondef('hash_talk.consume_message_admission(text,jsonb,jsonb,text,bigint)'::regprocedure);
  needle:='allowed:=allowed AND (after_row->>''revision'')::bigint=revision AND after_row->''ids''=jsonb_build_array(operation)';
  IF (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Unexpected admission journal guard'; END IF;
  EXECUTE replace(definition,needle,needle||' AND after_row->>''change_kind''=''append''');

  definition:=pg_get_functiondef('hash_talk.consume_message_removal_metadata(text,jsonb,jsonb,text,bigint)'::regprocedure);
  needle:='(before_row-''revision'')=(after_row-''revision'')';
  IF (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Unexpected removal head guard'; END IF;
  definition:=replace(definition,needle,'(before_row-ARRAY[''revision'',''invalidation_revision''])=(after_row-ARRAY[''revision'',''invalidation_revision''])');
  needle:='IF allowed THEN PERFORM hash_talk.mark_message_removal(''head_writes'',owner,2); END IF;';
  IF (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Unexpected removal fence guard'; END IF;
  definition:=replace(definition,needle,'allowed:=allowed AND (after_row->>''invalidation_revision'')::bigint=(after_row->>''revision'')::bigint; '||needle);
  needle:='allowed:=allowed AND (after_row->>''revision'')::bigint=revision AND';
  IF (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Unexpected removal journal guard'; END IF;
  EXECUTE replace(definition,needle,needle||' after_row->>''change_kind''=CASE WHEN kind=''clean'' THEN ''reset'' ELSE ''remove'' END AND');
END;
$$;

-- A reader may confirm a sequence high-water mark only with CACHE 1. Writers
-- allocate identities after participant locks; cached blocks could violate that
-- ordering across sessions. Fail migration rather than silently changing it.
DO $$ BEGIN
  IF (SELECT seqcache FROM pg_sequence WHERE seqrelid=pg_get_serial_sequence('hash_talk.message_packets','sequence')::regclass) IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'Message synchronization requires a CACHE 1 identity';
  END IF;
END $$;
