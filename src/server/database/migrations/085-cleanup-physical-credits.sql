-- Keep published checksums and the per-connection SQL allowance. Cleanup above
-- that allowance obtains durable credits for its excess before source effects.
-- No source/backfill/reset, payload permission or vault-maintain change.
ALTER TABLE hash_talk.content_allocations DROP CONSTRAINT content_allocations_check1;
ALTER TABLE hash_talk.content_allocations DROP CONSTRAINT content_allocations_check2;

DO $$
DECLARE definition text; needle text;
BEGIN
  definition:=pg_get_functiondef('hash_talk.consume_message_removal_cost(bigint)'::regprocedure);
  needle:='credit IS NULL OR credit>67108864 OR cost<=0';
  IF (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 THEN
    RAISE EXCEPTION 'Unexpected removal envelope definition';
  END IF;
  EXECUTE replace(definition,needle,'credit IS NULL OR cost<=0');

  definition:=pg_get_functiondef('hash_talk.prepare_personal_cleanup(uuid,jsonb,jsonb,integer,uuid[])'::regprocedure);
  needle:='budget_probe:=coalesce(private_bytes,0)+65536;';
  IF (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 THEN
    RAISE EXCEPTION 'Unexpected personal planning definition';
  END IF;
  -- The private envelope includes historical reference/read deletion work, not
  -- copies in the plan. Bound actual temporary metadata separately from work.
  definition:=replace(definition,needle,$body$SELECT 65536+coalesce(sum(8*(pg_column_size(before_state)::bigint+pg_column_size(after_state)::bigint+256)),0)
    INTO budget_probe FROM pg_temp.hash_talk_removal_plan;$body$);
  needle:='IF bytes>67108864 THEN RAISE EXCEPTION ''Personal cleanup exceeds SQL reserve'' USING ERRCODE=''PCA01''; END IF;';
  IF (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 THEN
    RAISE EXCEPTION 'Unexpected personal work envelope definition';
  END IF;
  EXECUTE replace(definition,needle,$body$IF bytes NOT BETWEEN 1 AND 9007199254740991 THEN
    RAISE EXCEPTION 'Invalid personal cleanup work envelope' USING ERRCODE='PCA01'; END IF;$body$);
END;
$$;
