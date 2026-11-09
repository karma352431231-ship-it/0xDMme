"""Exact 106→107 independent encrypted single-delivery payloads.

The new table starts empty. Existing messages, accounting rows, user data and
migration checksums must stay byte-identical. Activation retains the existing
backup, restore and worker-stop protocol; no ad-hoc production SQL is used.
"""
import deploy_remote as base
import deploy_follow_dates as previous

BEFORE = 'e900531457787c06b5ae40d4e2214808ba6c4de4'
REVIEWED = '9942a19c70f749ab1b9fde9222063ff7543e4b5b'
TABLES = previous.TABLES
NEW_TABLES = ('view_once_payloads',)
COUNTER_CHECKS = previous.COUNTER_CHECKS.replace('tgrelid)=97', 'tgrelid)=98')
GLOBAL_CHECK = previous.GLOBAL_CHECK.replace('sources<>97', 'sources<>98')
ABSENT = "SELECT to_regclass('hash_talk.view_once_payloads') IS NULL"
SCHEMA_CHECK = """SELECT
 NOT EXISTS(SELECT 1 FROM hash_talk.view_once_payloads)
 AND (SELECT count(*)=6 AND bool_and(tgenabled='O') FROM pg_trigger
   WHERE tgrelid='hash_talk.view_once_payloads'::regclass AND NOT tgisinternal)
 AND (SELECT count(*)=2 AND bool_and(tgenabled='O') FROM pg_trigger
   WHERE tgfoid='hash_talk.remove_view_once_payload()'::regprocedure)
 AND NOT EXISTS(SELECT 1 FROM pg_constraint
   WHERE conrelid='hash_talk.view_once_payloads'::regclass AND NOT convalidated)
 AND (SELECT count(*)=3 AND bool_and(indisvalid AND indisready) FROM pg_index
   WHERE indrelid='hash_talk.view_once_payloads'::regclass)
 AND pg_get_viewdef('hash_talk.account_quota_totals'::regclass) LIKE '%view_once_payloads%'
 AND hash_talk.engagement_visitor_retention()=interval '30 days'"""


def review(candidate, live):
    base.reviewed_database(candidate, live, {'before': BEFORE, 'reviewed': REVIEWED,
        'versions': 107, 'previous_versions': 106})
    base.verify_community_tables(TABLES)
    for unit in [base.UNIT, *previous.background.UNITS]:
        name = 'infra/staging/' + unit
        if base.digest(candidate / name) != base.digest(live / name):
            raise RuntimeError('View-once messages do not authorize worker unit changes.')
    sql = previous.search.directory.ranking.capacity
    for check in [ABSENT, previous.COUNTER_CHECKS, previous.GLOBAL_CHECK]:
        if sql.psql('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;' + check + ';ROLLBACK') != b't':
            raise RuntimeError('View-once predecessor schema or accounting differs.')


def snapshot():
    batches = previous.search.directory.ranking.batches
    small = tuple(name for name in TABLES if name not in batches.KEYS)
    result = previous.backups.database_snapshot(small,
        omit_columns={'content_usage_legacy': ('used_bytes',)},
        version_limit=107, include_reserved=True)
    result['tables'].update(batches.snapshot(previous.backups.node, previous.backups.URL_CHECK))
    return result


def verify_migration(candidate, before):
    after, versions = snapshot(), base.attachment_versions(candidate)
    if (before['versions'] != versions[:106] or after['versions'] != versions
            or before['tables'] != after['tables']):
        raise RuntimeError('View-once migration altered preserved rows, accounting or history.')
    base.verify_community_tables(TABLES + NEW_TABLES)
    if any(previous.search.directory.ranking.capacity.psql(sql) != b't' for sql in
           [SCHEMA_CHECK, COUNTER_CHECKS, GLOBAL_CHECK]):
        raise RuntimeError('View-once schema or capacity reconciliation failed.')


def activate(config, work, candidate, before_state):
    if config.get('view_once') is not True:
        raise RuntimeError('View-once messages require the explicit --view-once transition.')
    previous.background.verify_current(config)
    previous.search.directory.ranking.parts.require_workers()
    result = base.activate_database(config, work, candidate, {
        'before_state': before_state, 'review': review, 'snapshot': snapshot,
        'versions': 106, 'verify': verify_migration,
        'stop_existing': previous.background.stop, 'resume_existing': previous.background.start,
        'start': previous.background.start,
    })
    result['view_once_schema_versions'] = 107
    base.receipt(work, result)
    return result
