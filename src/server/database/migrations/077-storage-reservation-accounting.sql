-- Pending write envelopes are separate from logical quotas and physical disk use.
LOCK TABLE hash_talk.vault_operations, hash_talk.message_attachments,
  hash_talk.group_media, hash_talk.status_media, hash_talk.social_media,
  hash_talk.community_media IN SHARE ROW EXCLUSIVE MODE;

CREATE TABLE hash_talk.storage_reservation_usage (
  source text NOT NULL CHECK(source IN ('vault_operations','message_attachments',
    'group_media','status_media','social_media','community_media')),
  bucket smallint NOT NULL CHECK(bucket BETWEEN 0 AND 255),
  reservations bigint NOT NULL CHECK(reservations>=0),
  reserved_bytes bigint NOT NULL CHECK(reserved_bytes>=0),
  PRIMARY KEY(source,bucket)
) WITH (autovacuum_vacuum_scale_factor=0.05,autovacuum_vacuum_threshold=20,
  autovacuum_analyze_scale_factor=0.05,autovacuum_analyze_threshold=20);

-- Reference only; online readers aggregate the fixed derived partitions below.
CREATE VIEW hash_talk.storage_reservation_totals AS
WITH pending AS (
  SELECT 'vault_operations'::text AS source,id,charge::bigint AS bytes FROM hash_talk.vault_operations WHERE state IN ('reserved','writing')
  UNION ALL SELECT 'message_attachments',id,charge FROM hash_talk.message_attachments WHERE status IN ('reserved','writing','ready')
  UNION ALL SELECT 'group_media',id,charge FROM hash_talk.group_media WHERE status IN ('reserved','writing','ready')
  UNION ALL SELECT 'status_media',id,charge FROM hash_talk.status_media WHERE status IN ('reserved','writing','ready')
  UNION ALL SELECT 'social_media',id,charge FROM hash_talk.social_media WHERE status IN ('reserved','writing','ready')
  UNION ALL SELECT 'community_media',id,charge FROM hash_talk.community_media WHERE status IN ('uploading','processing')
), totals AS (
  SELECT source,get_byte(uuid_send(id),0) AS bucket,count(*)::bigint AS reservations,sum(bytes)::bigint AS reserved_bytes
  FROM pending GROUP BY source,get_byte(uuid_send(id),0)
)
SELECT sources.source,b.bucket::smallint,coalesce(t.reservations,0)::bigint AS reservations,
  coalesce(t.reserved_bytes,0)::bigint AS reserved_bytes
  FROM (VALUES('vault_operations'),('message_attachments'),('group_media'),
    ('status_media'),('social_media'),('community_media')) sources(source)
  CROSS JOIN generate_series(0,255) b(bucket)
  LEFT JOIN totals t ON t.source=sources.source AND t.bucket=b.bucket;

INSERT INTO hash_talk.storage_reservation_usage SELECT * FROM hash_talk.storage_reservation_totals;

CREATE FUNCTION hash_talk.track_storage_reservations() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE projection text; source_sql text; new_sql text; old_sql text;
  ledger_locked boolean:=false; delta record;
BEGIN
  projection:=format('SELECT get_byte(uuid_send(id),0) AS bucket,
    CASE WHEN %1$I=ANY(%2$L::text[]) THEN 1::bigint ELSE 0::bigint END AS reservations,
    CASE WHEN %1$I=ANY(%2$L::text[]) THEN charge::bigint ELSE 0::bigint END AS bytes FROM %%1$s',TG_ARGV[0],TG_ARGV[1]);
  new_sql:=format(projection,'new_rows'); old_sql:=format(projection,'old_rows');
  CASE TG_OP
    WHEN 'INSERT' THEN source_sql:=new_sql;
    WHEN 'DELETE' THEN source_sql:='SELECT bucket,-reservations AS reservations,-bytes AS bytes FROM ('||old_sql||') previous';
    ELSE source_sql:=new_sql||' UNION ALL SELECT bucket,-reservations,-bytes FROM ('||old_sql||') previous';
  END CASE;
  FOR delta IN EXECUTE 'SELECT bucket,sum(reservations)::bigint AS reservations,sum(bytes)::bigint AS bytes
    FROM ('||source_sql||') changes GROUP BY bucket
    HAVING sum(reservations)<>0 OR sum(bytes)<>0 ORDER BY bucket'
  LOOP
    IF NOT ledger_locked THEN
      PERFORM used_bytes FROM hash_talk.content_usage WHERE singleton FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Global quota accounting unavailable'; END IF;
      ledger_locked:=true;
    END IF;
    UPDATE hash_talk.storage_reservation_usage SET
      reservations=reservations+delta.reservations,reserved_bytes=reserved_bytes+delta.bytes
      WHERE source=TG_TABLE_NAME AND bucket=delta.bucket;
    IF NOT FOUND THEN RAISE EXCEPTION 'Storage reservation accounting unavailable'; END IF;
  END LOOP;
  RETURN NULL;
END;
$$;

DO $$
DECLARE item record;
BEGIN
  FOR item IN SELECT * FROM (VALUES
    ('vault_operations','state','{reserved,writing}'),
    ('message_attachments','status','{reserved,writing,ready}'),
    ('group_media','status','{reserved,writing,ready}'),
    ('status_media','status','{reserved,writing,ready}'),
    ('social_media','status','{reserved,writing,ready}'),
    ('community_media','status','{uploading,processing}')
  ) sources(name,state_column,states)
  LOOP
    EXECUTE format('CREATE TRIGGER storage_insert AFTER INSERT ON hash_talk.%I
      REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT
      EXECUTE FUNCTION hash_talk.track_storage_reservations(%L,%L)',item.name,item.state_column,item.states);
    EXECUTE format('CREATE TRIGGER storage_update AFTER UPDATE ON hash_talk.%I
      REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT
      EXECUTE FUNCTION hash_talk.track_storage_reservations(%L,%L)',item.name,item.state_column,item.states);
    EXECUTE format('CREATE TRIGGER storage_delete AFTER DELETE ON hash_talk.%I
      REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT
      EXECUTE FUNCTION hash_talk.track_storage_reservations(%L,%L)',item.name,item.state_column,item.states);
  END LOOP;
END;
$$;
