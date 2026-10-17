-- Derived counters preserve the existing group text/media charges exactly.
-- Block writers while the backfill and trigger installation share one snapshot.
LOCK TABLE hash_talk.groups, hash_talk.group_events, hash_talk.group_members,
  hash_talk.group_consents, hash_talk.group_key_sets, hash_talk.group_packets,
  hash_talk.group_message_changes, hash_talk.group_matrix_envelopes,
  hash_talk.group_media, hash_talk.group_cleanups, hash_talk.group_links
  IN SHARE ROW EXCLUSIVE MODE;

CREATE TABLE hash_talk.group_quota_usage (
  group_id uuid PRIMARY KEY REFERENCES hash_talk.groups(id) ON DELETE CASCADE,
  text_bytes bigint NOT NULL CHECK(text_bytes>=0),
  media_bytes bigint NOT NULL CHECK(media_bytes>=0),
  accepted_media_bytes bigint NOT NULL CHECK(accepted_media_bytes>=0 AND accepted_media_bytes<=media_bytes)
) WITH (autovacuum_vacuum_scale_factor=0.05,autovacuum_vacuum_threshold=20,
  autovacuum_analyze_scale_factor=0.05,autovacuum_analyze_threshold=20);

-- Maintenance/reconciliation only: online admission reads group_quota_usage.
CREATE VIEW hash_talk.group_quota_totals AS
SELECT group_id,sum(text_bytes)::bigint AS text_bytes,
  sum(media_bytes)::bigint AS media_bytes,
  sum(accepted_media_bytes)::bigint AS accepted_media_bytes
FROM (
  SELECT id AS group_id,charge::bigint AS text_bytes,0::bigint AS media_bytes,
    0::bigint AS accepted_media_bytes FROM hash_talk.groups
  UNION ALL SELECT group_id,charge,0,0 FROM hash_talk.group_events
  UNION ALL SELECT group_id,charge,0,0 FROM hash_talk.group_members
  UNION ALL SELECT group_id,charge,0,0 FROM hash_talk.group_consents
  UNION ALL SELECT group_id,charge,0,0 FROM hash_talk.group_key_sets
  UNION ALL SELECT group_id,charge,0,0 FROM hash_talk.group_packets
  UNION ALL SELECT group_id,charge,0,0 FROM hash_talk.group_message_changes
  UNION ALL SELECT group_id,charge,0,0 FROM hash_talk.group_matrix_envelopes
  UNION ALL SELECT group_id,charge,0,0 FROM hash_talk.group_cleanups
  UNION ALL SELECT group_id,charge,0,0 FROM hash_talk.group_links
  UNION ALL SELECT group_id,text_charge,bytes,
    CASE WHEN status='accepted' THEN bytes ELSE 0 END FROM hash_talk.group_media
) charged GROUP BY group_id;

INSERT INTO hash_talk.group_quota_usage
SELECT group_id,text_bytes,media_bytes,accepted_media_bytes
FROM hash_talk.group_quota_totals;

-- Counter queries project identifiers and charges from statement transition rows.
-- Resolve net deltas before changing counters; no-op updates need no counter write.
CREATE FUNCTION hash_talk.track_group_quota() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source_sql text; new_sql text; old_sql text;
  media_expression text:='0::bigint'; accepted_expression text:='0::bigint';
  change record;
BEGIN
  IF TG_TABLE_NAME='group_media' THEN
    media_expression:='bytes::bigint';
    accepted_expression:='CASE WHEN status=''accepted'' THEN bytes::bigint ELSE 0::bigint END';
  END IF;
  new_sql:=format('SELECT %I AS group_id,%I::bigint AS text_bytes,%s AS media_bytes,%s AS accepted_media_bytes FROM new_rows',
    TG_ARGV[0],TG_ARGV[1],media_expression,accepted_expression);
  old_sql:=format('SELECT %I AS group_id,-%I::bigint AS text_bytes,-(%s) AS media_bytes,-(%s) AS accepted_media_bytes FROM old_rows',
    TG_ARGV[0],TG_ARGV[1],media_expression,accepted_expression);
  CASE TG_OP
    WHEN 'INSERT' THEN source_sql:=new_sql;
    WHEN 'DELETE' THEN source_sql:=old_sql;
    ELSE source_sql:=new_sql||' UNION ALL '||old_sql;
  END CASE;
  FOR change IN EXECUTE 'SELECT group_id,sum(text_bytes)::bigint AS text_bytes,
      sum(media_bytes)::bigint AS media_bytes,sum(accepted_media_bytes)::bigint AS accepted_media_bytes
      FROM ('||source_sql||') delta GROUP BY group_id
      HAVING sum(text_bytes)<>0 OR sum(media_bytes)<>0 OR sum(accepted_media_bytes)<>0
      ORDER BY group_id'
  LOOP
    IF TG_TABLE_NAME='groups' AND TG_OP='INSERT' THEN
      INSERT INTO hash_talk.group_quota_usage VALUES
        (change.group_id,change.text_bytes,change.media_bytes,change.accepted_media_bytes);
    ELSE
      UPDATE hash_talk.group_quota_usage SET
        text_bytes=text_bytes+change.text_bytes,
        media_bytes=media_bytes+change.media_bytes,
        accepted_media_bytes=accepted_media_bytes+change.accepted_media_bytes
        WHERE group_id=change.group_id;
      IF NOT FOUND AND EXISTS(SELECT 1 FROM hash_talk.groups WHERE id=change.group_id) THEN
        RAISE EXCEPTION 'Group quota accounting unavailable';
      END IF;
    END IF;
  END LOOP;
  RETURN NULL;
END;
$$;

DO $$
DECLARE source text; owner_column text; charge_column text;
BEGIN
  FOREACH source IN ARRAY ARRAY['groups','group_events','group_members',
    'group_consents','group_key_sets','group_packets','group_message_changes',
    'group_matrix_envelopes','group_media','group_cleanups','group_links']
  LOOP
    owner_column:=CASE WHEN source='groups' THEN 'id' ELSE 'group_id' END;
    charge_column:=CASE WHEN source='group_media' THEN 'text_charge' ELSE 'charge' END;
    EXECUTE format('CREATE TRIGGER quota_insert AFTER INSERT ON hash_talk.%I
      REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT
      EXECUTE FUNCTION hash_talk.track_group_quota(%L,%L)',source,owner_column,charge_column);
    EXECUTE format('CREATE TRIGGER quota_update AFTER UPDATE ON hash_talk.%I
      REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT
      EXECUTE FUNCTION hash_talk.track_group_quota(%L,%L)',source,owner_column,charge_column);
    EXECUTE format('CREATE TRIGGER quota_delete AFTER DELETE ON hash_talk.%I
      REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT
      EXECUTE FUNCTION hash_talk.track_group_quota(%L,%L)',source,owner_column,charge_column);
  END LOOP;
END;
$$;
