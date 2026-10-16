-- Preserve the attachment/personal-removal formula without online history sums.
LOCK TABLE hash_talk.accounts, hash_talk.message_attachments,
  hash_talk.personal_removals IN SHARE ROW EXCLUSIVE MODE;

CREATE TABLE hash_talk.attachment_quota_usage (
  account_id uuid PRIMARY KEY REFERENCES hash_talk.accounts(id) ON DELETE CASCADE,
  used_bytes bigint NOT NULL CHECK(used_bytes>=0)
) WITH (autovacuum_vacuum_scale_factor=0.05,autovacuum_vacuum_threshold=20,
  autovacuum_analyze_scale_factor=0.05,autovacuum_analyze_threshold=20);
CREATE TABLE hash_talk.attachment_quota_messages (
  message_id uuid NOT NULL,
  account_id uuid NOT NULL REFERENCES hash_talk.attachment_quota_usage(account_id) ON DELETE CASCADE,
  used_bytes bigint NOT NULL CHECK(used_bytes>0),
  PRIMARY KEY(message_id,account_id)
) WITH (autovacuum_vacuum_scale_factor=0.05,autovacuum_vacuum_threshold=20,
  autovacuum_analyze_scale_factor=0.05,autovacuum_analyze_threshold=20);
CREATE INDEX attachment_quota_messages_account ON hash_talk.attachment_quota_messages(account_id);

-- The reference view is for backfill/reconciliation only, never admission.
CREATE VIEW hash_talk.attachment_quota_totals AS
SELECT account_id,sum(bytes)::bigint AS used_bytes FROM (
  SELECT id AS account_id,0::bigint AS bytes FROM hash_talk.accounts
  UNION ALL
  SELECT participants.account_id,a.charge::bigint
    FROM hash_talk.message_attachments a
    CROSS JOIN LATERAL (VALUES(a.sender),(a.recipient)) participants(account_id)
    WHERE NOT EXISTS(SELECT 1 FROM hash_talk.personal_removals r
      WHERE r.account_id=participants.account_id AND r.kind='message' AND r.id=a.message_id)
) charged GROUP BY account_id;

INSERT INTO hash_talk.attachment_quota_usage SELECT * FROM hash_talk.attachment_quota_totals;
INSERT INTO hash_talk.attachment_quota_messages
SELECT a.message_id,participants.account_id,sum(a.charge)::bigint
  FROM hash_talk.message_attachments a
  CROSS JOIN LATERAL (VALUES(a.sender),(a.recipient)) participants(account_id)
  WHERE NOT EXISTS(SELECT 1 FROM hash_talk.personal_removals r
    WHERE r.account_id=participants.account_id AND r.kind='message' AND r.id=a.message_id)
  GROUP BY a.message_id,participants.account_id HAVING sum(a.charge)>0;

CREATE FUNCTION hash_talk.initialize_attachment_quota() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO hash_talk.attachment_quota_usage VALUES(NEW.id,0);
  RETURN NULL;
END;
$$;
CREATE TRIGGER quota_initialize_attachments AFTER INSERT ON hash_talk.accounts
  FOR EACH ROW EXECUTE FUNCTION hash_talk.initialize_attachment_quota();

CREATE FUNCTION hash_talk.track_attachment_quota() RETURNS trigger LANGUAGE plpgsql VOLATILE AS $$
DECLARE projection text; source_sql text; new_sql text; old_sql text;
  has_changes boolean; delta record;
BEGIN
  IF TG_TABLE_NAME='message_attachments' THEN
    projection:='SELECT message_id,sender AS account_id,charge::bigint AS amount FROM %1$s
      UNION ALL SELECT message_id,recipient,charge::bigint FROM %1$s';
  ELSE
    projection:='SELECT id AS message_id,account_id,1::bigint AS amount FROM %1$s WHERE kind=''message''';
  END IF;
  new_sql:=format(projection,'new_rows'); old_sql:=format(projection,'old_rows');
  CASE TG_OP
    WHEN 'INSERT' THEN source_sql:=new_sql;
    WHEN 'DELETE' THEN source_sql:='SELECT message_id,account_id,-amount AS amount FROM ('||old_sql||') previous';
    ELSE source_sql:=new_sql||' UNION ALL SELECT message_id,account_id,-amount FROM ('||old_sql||') previous';
  END CASE;
  source_sql:='SELECT message_id,account_id FROM ('||source_sql||') changes
    GROUP BY message_id,account_id HAVING sum(amount)<>0';
  EXECUTE 'SELECT EXISTS('||source_sql||')' INTO has_changes;
  IF NOT has_changes THEN RETURN NULL; END IF;

  -- Cross-table reads must happen AFTER this guard, in a fresh snapshot. The
  -- app uses READ COMMITTED; refuse stale transaction snapshots explicitly.
  IF current_setting('transaction_isolation')<>'read committed' THEN
    RAISE EXCEPTION 'Attachment quota mutations require READ COMMITTED';
  END IF;
  PERFORM used_bytes FROM hash_talk.content_usage WHERE singleton FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Global quota accounting unavailable'; END IF;

  -- Reconcile desired state instead of applying independent source deltas:
  -- a writable CTE may change both attachments and removals in one command.
  FOR delta IN EXECUTE 'WITH desired AS MATERIALIZED (
    SELECT c.message_id,c.account_id,CASE WHEN EXISTS(
      SELECT 1 FROM hash_talk.personal_removals r
      WHERE r.account_id=c.account_id AND r.kind=''message'' AND r.id=c.message_id)
      THEN 0::bigint ELSE coalesce((SELECT sum(a.charge)::bigint
        FROM hash_talk.message_attachments a WHERE a.message_id=c.message_id
        AND c.account_id IN (a.sender,a.recipient)),0) END AS used_bytes
    FROM ('||source_sql||') c),
    deltas AS MATERIALIZED (
      SELECT d.account_id,d.used_bytes-coalesce(p.used_bytes,0) AS bytes
      FROM desired d LEFT JOIN hash_talk.attachment_quota_messages p
        USING(message_id,account_id)),
    updated AS (
      INSERT INTO hash_talk.attachment_quota_messages(message_id,account_id,used_bytes)
      SELECT message_id,account_id,used_bytes FROM desired WHERE used_bytes>0 ORDER BY message_id,account_id
      ON CONFLICT(message_id,account_id) DO UPDATE SET used_bytes=EXCLUDED.used_bytes
        WHERE attachment_quota_messages.used_bytes<>EXCLUDED.used_bytes RETURNING account_id),
    removed AS (
      DELETE FROM hash_talk.attachment_quota_messages p USING desired d
      WHERE p.message_id=d.message_id AND p.account_id=d.account_id AND d.used_bytes=0 RETURNING p.account_id)
    SELECT account_id,sum(bytes)::bigint AS bytes FROM deltas
      GROUP BY account_id HAVING sum(bytes)<>0 ORDER BY account_id'
  LOOP
    UPDATE hash_talk.attachment_quota_usage SET used_bytes=used_bytes+delta.bytes
      WHERE account_id=delta.account_id;
    IF NOT FOUND AND EXISTS(SELECT 1 FROM hash_talk.accounts WHERE id=delta.account_id) THEN
      RAISE EXCEPTION 'Attachment quota accounting unavailable';
    END IF;
  END LOOP;
  RETURN NULL;
END;
$$;

DO $$
DECLARE source text;
BEGIN
  FOREACH source IN ARRAY ARRAY['message_attachments','personal_removals']
  LOOP
    EXECUTE format('CREATE TRIGGER quota_attachments_insert AFTER INSERT ON hash_talk.%I
      REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION hash_talk.track_attachment_quota()',source);
    EXECUTE format('CREATE TRIGGER quota_attachments_update AFTER UPDATE ON hash_talk.%I
      REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION hash_talk.track_attachment_quota()',source);
    EXECUTE format('CREATE TRIGGER quota_attachments_delete AFTER DELETE ON hash_talk.%I
      REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION hash_talk.track_attachment_quota()',source);
  END LOOP;
END;
$$;
