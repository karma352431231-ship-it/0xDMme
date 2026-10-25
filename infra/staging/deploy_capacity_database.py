"""Reviewed 072→090 capacity transition, exclusively through deploy.py."""

import os
import re
from pathlib import Path

import deploy_remote as base
import deploy_blocks45 as backups
import deploy_background as background
import deploy_community_addresses as addresses

BEFORE = '56e0d572edfd1c23f2a6d78f4b4676ee5718db9c'
REVIEWED = 'afa885c49670662db20d609064171c9bfa5023d6'
OLD_TABLES = addresses.OLD_TABLES + addresses.NEW_TABLES
NEW_TABLES = ('group_quota_usage', 'account_quota_usage', 'profile_quota_usage',
              'attachment_quota_usage', 'attachment_quota_messages',
              'storage_reservation_usage', 'content_allocation_guard',
              'content_allocations', 'content_usage_legacy', 'content_usage_partitions')
TABLES = tuple(name for name in OLD_TABLES if name != 'content_usage') + NEW_TABLES

CHECKS = """SELECT
  (SELECT relkind='v' FROM pg_class WHERE oid='hash_talk.content_usage'::regclass)
  AND (SELECT count(*)=1 FROM hash_talk.content_allocation_guard)
  AND NOT EXISTS(SELECT 1 FROM hash_talk.content_allocations)
  AND (SELECT count(DISTINCT tgrelid)=81 FROM pg_trigger
    WHERE tgfoid='hash_talk.track_statement_content_usage()'::regprocedure)
  AND NOT EXISTS(SELECT 1 FROM pg_trigger
    WHERE tgfoid='hash_talk.track_statement_content_usage()'::regprocedure AND tgenabled<>'O')
  AND NOT EXISTS(SELECT 1 FROM hash_talk.group_quota_usage q FULL JOIN hash_talk.group_quota_totals t USING(group_id)
    WHERE (q.text_bytes,q.media_bytes,q.accepted_media_bytes) IS DISTINCT FROM (t.text_bytes,t.media_bytes,t.accepted_media_bytes))
  AND NOT EXISTS(SELECT 1 FROM hash_talk.account_quota_usage q FULL JOIN hash_talk.account_quota_totals t USING(account_id)
    WHERE q.used_bytes IS DISTINCT FROM t.used_bytes)
  AND NOT EXISTS(SELECT 1 FROM hash_talk.profile_quota_usage q FULL JOIN hash_talk.profile_quota_totals t USING(profile_id)
    WHERE q.used_bytes IS DISTINCT FROM t.used_bytes)
  AND NOT EXISTS(SELECT 1 FROM hash_talk.attachment_quota_usage q FULL JOIN hash_talk.attachment_quota_totals t USING(account_id)
    WHERE q.used_bytes IS DISTINCT FROM t.used_bytes)
  AND NOT EXISTS(SELECT 1 FROM hash_talk.storage_reservation_usage q FULL JOIN hash_talk.storage_reservation_totals t USING(source,bucket)
    WHERE (q.reservations,q.reserved_bytes) IS DISTINCT FROM (t.reservations,t.reserved_bytes))
  AND (SELECT count(*)=1536 FROM hash_talk.storage_reservation_usage)
  AND (SELECT count(*)>=current_setting('max_connections')::integer FROM hash_talk.content_usage_partitions)"""
GLOBAL_CHECK = """DO $$
DECLARE source record; amount bigint; total bigint:=0; sources integer:=0;
BEGIN
  FOR source IN SELECT DISTINCT c.relname FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
    WHERE t.tgfoid='hash_talk.track_statement_content_usage()'::regprocedure
  LOOP
    IF source.relname='accounts' THEN
      SELECT coalesce(sum(coalesce(octet_length(profile_ciphertext)+524,0)),0) INTO amount FROM hash_talk.accounts;
    ELSE
      EXECUTE format('SELECT coalesce(sum(charge),0) FROM hash_talk.%I',source.relname) INTO amount;
    END IF;
    total:=total+amount; sources:=sources+1;
  END LOOP;
  SELECT total+coalesce(sum(charge),0) INTO total FROM hash_talk.community_ranking_entries;
  IF sources<>81 OR (SELECT used_bytes FROM hash_talk.content_usage WHERE singleton) IS DISTINCT FROM total THEN
    RAISE EXCEPTION 'Capacity source/global reconciliation failed';
  END IF;
END;
$$; SELECT true"""


def psql(sql):
    return backups.pg(['psql', '--no-psqlrc', '--quiet', '--set=ON_ERROR_STOP=1',
                       '--tuples-only', '--no-align', '-c', sql]).strip()


def volume_review():
    pid = int(base.run(['systemctl', 'show', base.UNIT, '-p', 'MainPID', '--value']).strip())
    if pid <= 1:
        raise RuntimeError('Own web namespace unavailable for volume verification.')
    root = Path('/proc') / str(pid) / 'root/opt/0xdmme/release'
    device = root.stat().st_dev
    if (not root.is_dir() or root.parent.stat().st_dev == device
            or any((base.DATA / name).stat().st_dev != device for name in ['', 'objects', 'postgres'])):
        raise RuntimeError('Capacity release, objects and PostgreSQL must share the dedicated data volume.')
    space = os.statvfs(root)
    if space.f_frsize <= 0 or space.f_bavail <= 0:
        raise RuntimeError('Capacity data volume measurement unavailable.')


def review(candidate, live):
    if not all(re.fullmatch(r'[a-f0-9]{40}', value) for value in [BEFORE, REVIEWED]):
        raise RuntimeError('Capacity transition requires exact source review.')
    base.reviewed_database(candidate, live, {'before': BEFORE, 'reviewed': REVIEWED,
        'versions': 90, 'previous_versions': 72})
    base.verify_community_tables(OLD_TABLES)
    for unit in [base.UNIT, *background.UNITS]:
        name = 'infra/staging/' + unit
        if base.digest(candidate / name) != base.digest(live / name):
            raise RuntimeError('Capacity transition does not authorize web/worker unit changes.')
    volume_review()


def snapshot():
    # Preserve the observable projection even after content_usage becomes a view.
    return backups.database_snapshot(OLD_TABLES, version_limit=90)


def verify_migration(candidate, before):
    after, versions = snapshot(), base.attachment_versions(candidate)
    if (before['versions'] != versions[:72] or after['versions'] != versions
            or after['tables'] != before['tables']):
        raise RuntimeError('Capacity migration changed source rows, logical totals or applied history.')
    base.verify_community_tables(TABLES)
    if psql(CHECKS) != b't' or psql(GLOBAL_CHECK) != b't':
        raise RuntimeError('Capacity counters, pending promises, credits or global accounting differ.')


def activate(config, work, candidate, before_state):
    import deploy_capacity_proxy as proxy
    proxy.review(config)
    background.verify_current(config)
    result = base.activate_database(config, work, candidate, {
        'before_state': before_state, 'review': review, 'snapshot': snapshot,
        'versions': 72, 'verify': verify_migration,
        'stop_existing': background.stop, 'resume_existing': background.start,
        'start': background.start,
        'install': lambda: proxy.install(config, work, before_state),
        'uninstall': lambda: proxy.restore(config, before_state),
    })
    proposal = proxy.validate(config)
    result.update(capacity_schema_versions=90,
                  capacity_proxy_before_sha256=proposal['old_sha256'],
                  capacity_proxy_sha256=proposal['new_sha256'])
    base.receipt(work, result)
    return result
