"""Owner-approved 107→109 group actions and per-account view-once delivery.

Internal transition of deploy.py only. Preserve every old row, ciphertext,
quota ledger and migration checksum; both added tables start empty.
"""
import deploy_remote as base
import deploy_follow_dates as previous

BEFORE = 'fb82b0a99cc0907de8e98c8e64014cdad22adb5a'
REVIEWED = '8bec16d942b97bb9cd8369076bcb56a75eff0a0b'
TABLES = previous.TABLES + ('view_once_payloads',)
NEW_TABLES = ('group_view_once_payloads', 'group_view_once_deliveries')
PREVIOUS_COUNTERS = previous.COUNTER_CHECKS.replace('tgrelid)=97', 'tgrelid)=98')
PREVIOUS_GLOBAL = previous.GLOBAL_CHECK.replace('sources<>97', 'sources<>98')
COUNTER_CHECKS = previous.COUNTER_CHECKS.replace('tgrelid)=97', 'tgrelid)=99')
GLOBAL_CHECK = previous.GLOBAL_CHECK.replace('sources<>97', 'sources<>99')
ABSENT = """SELECT to_regclass('hash_talk.group_view_once_payloads') IS NULL
 AND to_regclass('hash_talk.group_view_once_deliveries') IS NULL
 AND to_regclass('hash_talk.group_latest_action') IS NULL"""
SCHEMA_CHECK = """SELECT
 NOT EXISTS(SELECT 1 FROM hash_talk.group_view_once_payloads)
 AND NOT EXISTS(SELECT 1 FROM hash_talk.group_view_once_deliveries)
 AND (SELECT convalidated AND pg_get_constraintdef(oid) LIKE '%reaction%'
   FROM pg_constraint WHERE conrelid='hash_talk.group_packets'::regclass
   AND conname='group_packets_relation_check')
 AND (SELECT indisvalid AND indisready FROM pg_index
   WHERE indexrelid='hash_talk.group_latest_action'::regclass)
 AND (SELECT count(*)=6 AND bool_and(tgenabled='O') FROM pg_trigger
   WHERE tgrelid='hash_talk.group_view_once_payloads'::regclass AND NOT tgisinternal)
 AND (SELECT count(*)=1 AND bool_and(tgenabled='O') FROM pg_trigger
   WHERE tgrelid='hash_talk.group_packets'::regclass AND tgname='group_view_once_remove')
 AND (SELECT count(*)=1 AND bool_and(tgenabled='O') FROM pg_trigger
   WHERE tgrelid='hash_talk.group_members'::regclass AND tgname='group_view_once_leave')
 AND NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid IN
   ('hash_talk.group_view_once_payloads'::regclass,'hash_talk.group_view_once_deliveries'::regclass)
   AND NOT convalidated)
 AND (SELECT count(*)=3 AND bool_and(indisvalid AND indisready) FROM pg_index
   WHERE indrelid='hash_talk.group_view_once_payloads'::regclass)
 AND (SELECT count(*)=1 AND bool_and(indisvalid AND indisready) FROM pg_index
   WHERE indrelid='hash_talk.group_view_once_deliveries'::regclass)
 AND pg_get_viewdef('hash_talk.group_quota_totals'::regclass) LIKE '%group_view_once_payloads%'"""


def review(candidate, live):
    base.reviewed_database(candidate, live, {'before': BEFORE, 'reviewed': REVIEWED,
        'versions': 109, 'previous_versions': 107})
    base.verify_community_tables(TABLES)
    for unit in [base.UNIT, *previous.background.UNITS]:
        name = 'infra/staging/' + unit
        if base.digest(candidate / name) != base.digest(live / name):
            raise RuntimeError('Group chat does not authorize web/worker unit changes.')
    sql = previous.search.directory.ranking.capacity
    for check in [ABSENT, PREVIOUS_COUNTERS, PREVIOUS_GLOBAL]:
        if sql.psql('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;' + check + ';ROLLBACK') != b't':
            raise RuntimeError('Group chat predecessor schema or accounting differs.')


def snapshot():
    batches = previous.search.directory.ranking.batches
    small = tuple(name for name in TABLES if name not in batches.KEYS)
    result = previous.backups.database_snapshot(small, version_limit=109, include_reserved=True)
    result['tables'].update(batches.snapshot(previous.backups.node, previous.backups.URL_CHECK))
    return result


def verify_migration(candidate, before):
    after, versions = snapshot(), base.attachment_versions(candidate)
    if (before['versions'] != versions[:107] or after['versions'] != versions
            or before['tables'] != after['tables']):
        raise RuntimeError('Group chat migration altered preserved rows, ciphertext, accounting or history.')
    base.verify_community_tables(TABLES + NEW_TABLES)
    if any(previous.search.directory.ranking.capacity.psql(sql) != b't' for sql in
           [SCHEMA_CHECK, COUNTER_CHECKS, GLOBAL_CHECK]):
        raise RuntimeError('Group chat schema or capacity reconciliation failed.')


def activate(config, work, candidate, before_state):
    if config.get('group_chat') is not True:
        raise RuntimeError('Group chat requires explicit --group-chat approval.')
    previous.background.verify_current(config)
    previous.search.directory.ranking.parts.require_workers()
    result = base.activate_database(config, work, candidate, {
        'before_state': before_state, 'review': review, 'snapshot': snapshot,
        'versions': 107, 'verify': verify_migration,
        'stop_existing': previous.background.stop, 'resume_existing': previous.background.start,
        'start': previous.background.start,
    })
    result['group_chat_schema_versions'] = 109
    base.receipt(work, result)
    return result
