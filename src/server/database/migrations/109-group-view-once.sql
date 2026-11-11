CREATE TABLE hash_talk.group_view_once_payloads (
  id uuid PRIMARY KEY,
  group_id uuid NOT NULL REFERENCES hash_talk.groups(id) ON DELETE CASCADE,
  sender uuid NOT NULL REFERENCES hash_talk.accounts(id) ON DELETE CASCADE,
  epoch integer NOT NULL CHECK(epoch>0),
  hash text NOT NULL CHECK(hash ~ '^[a-f0-9]{64}$'),
  manifest jsonb NOT NULL,
  expected_bytes integer NOT NULL CHECK(expected_bytes BETWEEN 16 AND 14000000),
  ciphertext bytea NOT NULL DEFAULT ''::bytea,
  ready boolean NOT NULL DEFAULT false,
  attached boolean NOT NULL DEFAULT false,
  sequence bigint NOT NULL DEFAULT nextval('hash_talk.group_media_sequence_seq'),
  cleanup uuid,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  charge bigint NOT NULL CHECK(charge>=0),
  text_charge bigint NOT NULL CHECK(text_charge>=0),
  media_bytes bigint NOT NULL CHECK(media_bytes>=0),
  CHECK(octet_length(ciphertext)<=expected_bytes)
) WITH (autovacuum_vacuum_scale_factor=0.05,autovacuum_vacuum_threshold=20,
  autovacuum_analyze_scale_factor=0.05,autovacuum_analyze_threshold=20);
CREATE INDEX group_view_once_pending ON hash_talk.group_view_once_payloads(created_at) WHERE NOT attached;
CREATE INDEX group_view_once_retention ON hash_talk.group_view_once_payloads(group_id,created_at) WHERE attached AND media_bytes>0;
CREATE TABLE hash_talk.group_view_once_deliveries (
  message_id uuid NOT NULL REFERENCES hash_talk.group_view_once_payloads(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES hash_talk.accounts(id) ON DELETE CASCADE,
  key jsonb,
  consumed_at timestamptz,
  PRIMARY KEY(message_id,account_id),
  CHECK((key IS NULL)=(consumed_at IS NOT NULL))
) WITH (autovacuum_vacuum_scale_factor=0.05,autovacuum_vacuum_threshold=20,
  autovacuum_analyze_scale_factor=0.05,autovacuum_analyze_threshold=20);

CREATE FUNCTION hash_talk.track_group_view_once_quota() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source text; change record;
BEGIN
  CASE TG_OP
    WHEN 'INSERT' THEN source:='SELECT group_id,text_charge,media_bytes,CASE WHEN attached THEN media_bytes ELSE 0 END AS accepted FROM new_rows';
    WHEN 'DELETE' THEN source:='SELECT group_id,-text_charge AS text_charge,-media_bytes AS media_bytes,CASE WHEN attached THEN -media_bytes ELSE 0 END AS accepted FROM old_rows';
    ELSE source:='SELECT group_id,text_charge,media_bytes,CASE WHEN attached THEN media_bytes ELSE 0 END AS accepted FROM new_rows UNION ALL SELECT group_id,-text_charge,-media_bytes,CASE WHEN attached THEN -media_bytes ELSE 0 END AS accepted FROM old_rows';
  END CASE;
  FOR change IN EXECUTE 'SELECT group_id,sum(text_charge) AS text_bytes,sum(media_bytes) AS media_bytes,sum(accepted) AS accepted FROM ('||source||') delta GROUP BY group_id HAVING sum(text_charge)<>0 OR sum(media_bytes)<>0 OR sum(accepted)<>0 ORDER BY group_id'
  LOOP
    UPDATE hash_talk.group_quota_usage SET text_bytes=text_bytes+change.text_bytes,media_bytes=media_bytes+change.media_bytes,accepted_media_bytes=accepted_media_bytes+change.accepted WHERE group_id=change.group_id;
    IF NOT FOUND AND EXISTS(SELECT 1 FROM hash_talk.groups WHERE id=change.group_id) THEN RAISE EXCEPTION 'Group quota accounting unavailable'; END IF;
  END LOOP;
  RETURN NULL;
END;
$$;
DO $$
DECLARE action text;
BEGIN
  FOREACH action IN ARRAY ARRAY['INSERT','UPDATE','DELETE'] LOOP
    EXECUTE format('CREATE TRIGGER content_usage_%s AFTER %s ON hash_talk.group_view_once_payloads %s FOR EACH STATEMENT EXECUTE FUNCTION hash_talk.track_statement_content_usage()',lower(action),action,CASE action WHEN 'INSERT' THEN 'REFERENCING NEW TABLE AS new_rows' WHEN 'DELETE' THEN 'REFERENCING OLD TABLE AS old_rows' ELSE 'REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows' END);
    EXECUTE format('CREATE TRIGGER quota_%s AFTER %s ON hash_talk.group_view_once_payloads %s FOR EACH STATEMENT EXECUTE FUNCTION hash_talk.track_group_view_once_quota()',lower(action),action,CASE action WHEN 'INSERT' THEN 'REFERENCING NEW TABLE AS new_rows' WHEN 'DELETE' THEN 'REFERENCING OLD TABLE AS old_rows' ELSE 'REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows' END);
  END LOOP;
END;
$$;
DO $$
DECLARE previous text;
BEGIN
  previous:=regexp_replace(pg_get_viewdef('hash_talk.group_quota_totals'::regclass,true),';[[:space:]]*$','');
  EXECUTE 'CREATE OR REPLACE VIEW hash_talk.group_quota_totals AS SELECT group_id,sum(text_bytes)::bigint AS text_bytes,sum(media_bytes)::bigint AS media_bytes,sum(accepted_media_bytes)::bigint AS accepted_media_bytes FROM (SELECT * FROM ('||previous||') existing UNION ALL SELECT group_id,text_charge,media_bytes,CASE WHEN attached THEN media_bytes ELSE 0 END FROM hash_talk.group_view_once_payloads) charged GROUP BY group_id';
END;
$$;
CREATE FUNCTION hash_talk.remove_group_view_once_payload() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' OR NEW.body->'viewOnce' IS NULL THEN
    DELETE FROM hash_talk.group_view_once_payloads WHERE id=OLD.id AND group_id=OLD.group_id;
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER group_view_once_remove AFTER UPDATE OF body OR DELETE ON hash_talk.group_packets FOR EACH ROW EXECUTE FUNCTION hash_talk.remove_group_view_once_payload();
CREATE FUNCTION hash_talk.remove_group_view_once_member() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE hash_talk.group_view_once_deliveries d SET key=NULL,consumed_at=clock_timestamp() FROM hash_talk.group_view_once_payloads p WHERE d.message_id=p.id AND p.group_id=OLD.group_id AND d.account_id=OLD.account_id AND d.consumed_at IS NULL;
  UPDATE hash_talk.group_view_once_payloads p SET ciphertext=''::bytea,charge=octet_length(manifest::text)+1024,text_charge=octet_length(manifest::text)+1024,media_bytes=0 WHERE p.group_id=OLD.group_id AND p.attached AND NOT EXISTS(SELECT 1 FROM hash_talk.group_view_once_deliveries d WHERE d.message_id=p.id AND d.consumed_at IS NULL);
  RETURN NULL;
END;
$$;
CREATE TRIGGER group_view_once_leave AFTER DELETE ON hash_talk.group_members FOR EACH ROW EXECUTE FUNCTION hash_talk.remove_group_view_once_member();
