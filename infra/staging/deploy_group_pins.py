"""Owner-approved 109→110 pinned group messages.

Internal transition of deploy.py only. Migration 110 replaces one check
constraint so group packets accept the `pin` action next to edits and
reactions. No table, row, ciphertext, quota ledger or prior checksum changes.
"""
import deploy_remote as base
import deploy_follow_dates as older

BEFORE = '6979a630afb31a966cfc8a8928dd2d7985ad5423'
REVIEWED = '011abafc0bd41c4d2d6eb2d2fa0a77f7dfc6cbdc'
# State after 109 (deploy_group_chat), restated so the executor stays in
# budget without loading that transition.
TABLES = older.TABLES + ('view_once_payloads', 'group_view_once_payloads',
                         'group_view_once_deliveries')
COUNTER_CHECKS = older.COUNTER_CHECKS.replace('tgrelid)=97', 'tgrelid)=99')
GLOBAL_CHECK = older.GLOBAL_CHECK.replace('sources<>97', 'sources<>99')
CONSTRAINT = """(SELECT pg_get_constraintdef(oid) FROM pg_constraint
 WHERE conrelid='hash_talk.group_packets'::regclass
 AND conname='group_packets_relation_check')"""
ABSENT = 'SELECT ' + CONSTRAINT + " NOT LIKE '%''pin''%'"
SCHEMA_CHECK = """SELECT (SELECT convalidated FROM pg_constraint
 WHERE conrelid='hash_talk.group_packets'::regclass
 AND conname='group_packets_relation_check')
 AND """ + CONSTRAINT + """ LIKE '%''edit''%''reaction''%''pin''%'"""


def review(candidate, live):
    base.reviewed_database(candidate, live, {'before': BEFORE, 'reviewed': REVIEWED,
        'versions': 110, 'previous_versions': 109})
    base.verify_community_tables(TABLES)
    for unit in [base.UNIT, *older.background.UNITS]:
        name = 'infra/staging/' + unit
        if base.digest(candidate / name) != base.digest(live / name):
            raise RuntimeError('Group pins do not authorize web/worker unit changes.')
    sql = older.search.directory.ranking.capacity
    for check in [ABSENT, COUNTER_CHECKS, GLOBAL_CHECK]:
        if sql.psql('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;' + check + ';ROLLBACK') != b't':
            raise RuntimeError('Group pins predecessor schema or accounting differs.')


def snapshot():
    batches = older.search.directory.ranking.batches
    small = tuple(name for name in TABLES if name not in batches.KEYS)
    result = older.backups.database_snapshot(small, version_limit=110, include_reserved=True)
    result['tables'].update(batches.snapshot(older.backups.node, older.backups.URL_CHECK))
    return result


def verify_migration(candidate, before):
    after, versions = snapshot(), base.attachment_versions(candidate)
    if (before['versions'] != versions[:109] or after['versions'] != versions
            or before['tables'] != after['tables']):
        raise RuntimeError('Group pins migration altered preserved rows, ciphertext, accounting or history.')
    base.verify_community_tables(TABLES)
    if any(older.search.directory.ranking.capacity.psql(sql) != b't' for sql in
           [SCHEMA_CHECK, COUNTER_CHECKS, GLOBAL_CHECK]):
        raise RuntimeError('Group pins schema or capacity reconciliation failed.')


def activate(config, work, candidate, before_state):
    if config.get('group_pins') is not True:
        raise RuntimeError('Group pins require explicit --group-pins approval.')
    background = older.background
    background.verify_current(config)
    older.search.directory.ranking.parts.require_workers()
    result = base.activate_database(config, work, candidate, {
        'before_state': before_state, 'review': review, 'snapshot': snapshot,
        'versions': 109, 'verify': verify_migration,
        'stop_existing': background.stop, 'resume_existing': background.start,
        'start': background.start,
    })
    result['group_pins_schema_versions'] = 110
    base.receipt(work, result)
    return result
