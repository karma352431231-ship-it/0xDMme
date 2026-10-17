-- Consolidate charged rows before touching the global ledger. The ledger guard
-- remains; this removes per-row counter writes, not transaction serialization.
CREATE FUNCTION hash_talk.track_statement_content_usage() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE before_bytes bigint:=0; after_bytes bigint:=0; amount bigint; expression text;
BEGIN
  expression:=CASE WHEN TG_TABLE_NAME='accounts'
    THEN 'coalesce(octet_length(profile_ciphertext)+524,0)::bigint'
    ELSE 'charge::bigint' END;
  IF TG_OP<>'DELETE' THEN
    EXECUTE 'SELECT coalesce(sum('||expression||'),0)::bigint FROM new_rows' INTO after_bytes;
  END IF;
  IF TG_OP<>'INSERT' THEN
    EXECUTE 'SELECT coalesce(sum('||expression||'),0)::bigint FROM old_rows' INTO before_bytes;
  END IF;
  amount:=after_bytes-before_bytes;
  IF amount=0 THEN RETURN NULL; END IF;
  UPDATE hash_talk.content_usage SET used_bytes=used_bytes+amount WHERE singleton;
  IF NOT FOUND THEN RAISE EXCEPTION 'Global quota accounting unavailable'; END IF;
  -- Keep global-before-cache ordering for generation and entry publishers.
  IF TG_TABLE_NAME='community_ranking_generations' THEN
    UPDATE hash_talk.community_ranking_cache_usage SET used_bytes=used_bytes+amount WHERE singleton;
    IF NOT FOUND THEN RAISE EXCEPTION 'Ranking cache accounting unavailable'; END IF;
  END IF;
  RETURN NULL;
END;
$$;

DO $$
DECLARE sources text; source_count integer; source record;
BEGIN
  SELECT count(*),string_agg(format('hash_talk.%I',c.relname),',' ORDER BY c.relname)
    INTO source_count,sources
    FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='hash_talk' AND t.tgfoid IN (
      'hash_talk.track_content_usage()'::regprocedure,
      'hash_talk.track_message_usage()'::regprocedure,
      'hash_talk.track_message_recovery_usage()'::regprocedure);
  IF source_count<>81 THEN RAISE EXCEPTION 'Unexpected global accounting catalog'; END IF;
  EXECUTE 'LOCK TABLE '||sources||' IN SHARE ROW EXCLUSIVE MODE';

  -- Generation cache accounting joins the same batch; leaving its old row
  -- trigger would count twice and acquire the cache before the global guard.
  DROP TRIGGER ranking_generation_cache_usage ON hash_talk.community_ranking_generations;
  FOR source IN
    SELECT c.relname,t.tgname,t.tgtype,t.tgenabled
      FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
        JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='hash_talk' AND t.tgfoid IN (
        'hash_talk.track_content_usage()'::regprocedure,
        'hash_talk.track_message_usage()'::regprocedure,
        'hash_talk.track_message_recovery_usage()'::regprocedure)
      ORDER BY c.relname,t.tgname
  LOOP
    IF source.tgtype NOT IN (13,29) OR source.tgenabled<>'O' THEN
      RAISE EXCEPTION 'Unexpected global accounting trigger';
    END IF;
    EXECUTE format('DROP TRIGGER %I ON hash_talk.%I',source.tgname,source.relname);
    -- Names precede quota/storage statement triggers, preserving ledger order.
    EXECUTE format('CREATE TRIGGER content_usage_insert AFTER INSERT ON hash_talk.%I
      REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT
      EXECUTE FUNCTION hash_talk.track_statement_content_usage()',source.relname);
    EXECUTE format('CREATE TRIGGER content_usage_delete AFTER DELETE ON hash_talk.%I
      REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT
      EXECUTE FUNCTION hash_talk.track_statement_content_usage()',source.relname);
    IF (source.tgtype & 16)<>0 THEN
      -- PostgreSQL transition relations cannot use an UPDATE column list.
      -- Unrelated/unchanged updates reduce to zero without a ledger write.
      EXECUTE format('CREATE TRIGGER content_usage_update AFTER UPDATE ON hash_talk.%I
        REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT
        EXECUTE FUNCTION hash_talk.track_statement_content_usage()',source.relname);
    END IF;
  END LOOP;
END;
$$;

DROP FUNCTION hash_talk.track_content_usage();
DROP FUNCTION hash_talk.track_message_usage();
DROP FUNCTION hash_talk.track_message_recovery_usage();
DROP FUNCTION hash_talk.track_ranking_generation_cache();
