"""Reviewed 110→111 conversation notification cursors for deploy.py."""
import deploy_remote as base
import deploy_follow_dates as previous

BEFORE = 'c18c176b6226b1b52e63a1fe06cccc42357532c1'
REVIEWED = '63a4e9467a5de9f17ed26e328a1d6f26ab38810e'
TABLES = previous.TABLES + ('view_once_payloads', 'group_view_once_payloads',
                           'group_view_once_deliveries')
OMIT_COLUMNS = {name: ('notifications_through',)
                for name in ('conversation_controls', 'group_controls')}
COUNTER_CHECKS = previous.COUNTER_CHECKS.replace('tgrelid)=97', 'tgrelid)=99')
GLOBAL_CHECK = previous.GLOBAL_CHECK.replace('sources<>97', 'sources<>99')
CURSOR_COLUMNS = """FROM information_schema.columns WHERE table_schema='hash_talk'
 AND table_name IN ('conversation_controls','group_controls')
 AND column_name='notifications_through'"""
ABSENT = 'SELECT NOT EXISTS(SELECT 1 ' + CURSOR_COLUMNS + ')'
SCHEMA_CHECK = """SELECT
 (SELECT count(*)=2 AND bool_and(data_type='bigint' AND is_nullable='NO'
   AND column_default IN ('0','0::bigint','''0''::bigint')) """ + CURSOR_COLUMNS + """)
 AND (SELECT count(*)=2 AND bool_and(convalidated) FROM pg_constraint WHERE
   (conrelid='hash_talk.conversation_controls'::regclass
      AND conname='conversation_controls_notifications_through_check') OR
   (conrelid='hash_talk.group_controls'::regclass
      AND conname='group_controls_notifications_through_check'))
 AND NOT EXISTS(SELECT 1 FROM hash_talk.conversation_controls WHERE notifications_through<>0)
 AND NOT EXISTS(SELECT 1 FROM hash_talk.group_controls WHERE notifications_through<>0)"""


def review(candidate, live):
    base.reviewed_database(candidate, live, {'before': BEFORE, 'reviewed': REVIEWED,
        'versions': 111, 'previous_versions': 110})
    base.verify_community_tables(TABLES)
    for unit in [base.UNIT, *previous.background.UNITS]:
        name = 'infra/staging/' + unit
        if base.digest(candidate / name) != base.digest(live / name):
            raise RuntimeError('Notification cursors do not authorize web/worker unit changes.')
    sql = previous.search.directory.ranking.capacity
    for check in [ABSENT, COUNTER_CHECKS, GLOBAL_CHECK]:
        if sql.psql('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;' + check + ';ROLLBACK') != b't':
            raise RuntimeError('Notification cursor predecessor schema or accounting differs.')


def snapshot():
    batches = previous.search.directory.ranking.batches
    small = tuple(name for name in TABLES if name not in batches.KEYS)
    result = previous.backups.database_snapshot(small, omit_columns=OMIT_COLUMNS,
        version_limit=111, include_reserved=True)
    result['tables'].update(batches.snapshot(previous.backups.node, previous.backups.URL_CHECK))
    return result


def verify_migration(candidate, before):
    after, versions = snapshot(), base.attachment_versions(candidate)
    if (before['versions'] != versions[:110] or after['versions'] != versions
            or before['tables'] != after['tables']):
        raise RuntimeError('Notification cursors changed preserved rows, accounting or checksums.')
    base.verify_community_tables(TABLES)
    sql = previous.search.directory.ranking.capacity
    if any(sql.psql(check) != b't' for check in [SCHEMA_CHECK, COUNTER_CHECKS, GLOBAL_CHECK]):
        raise RuntimeError('Notification cursor schema or capacity reconciliation failed.')


def activate(config, work, candidate, before_state):
    if config.get('notification_cursors') is not True:
        raise RuntimeError('Notification cursors require explicit --notification-cursors approval.')
    background = previous.background
    background.verify_current(config)
    previous.search.directory.ranking.parts.require_workers()
    result = base.activate_database(config, work, candidate, {
        'before_state': before_state, 'review': review, 'snapshot': snapshot,
        'versions': 110, 'verify': verify_migration,
        'stop_existing': background.stop, 'resume_existing': background.start,
        'start': background.start,
    })
    result['notification_cursor_schema_versions'] = 111
    base.receipt(work, result)
    return result
