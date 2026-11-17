"""Reviewed 111→113 extra sign-in wallets and confirming session wallet.

Internal transition of deploy.py only. Migration 112 adds the empty
account_wallets table; 113 adds two nullable columns to login_sessions that
stay NULL for every existing session. Every old row, quota ledger and
migration checksum is preserved.
"""
import deploy_remote as base
import deploy_follow_dates as previous

BEFORE = 'ed14d52d257fbf65e26f7d99a08b7c9cc41e192d'
REVIEWED = '440e7012feaf92d6f5f3d660f226a3f0bf4ed20c'
# State after 111 (deploy_notification_cursors), restated so the executor
# stays inside its size budget without loading that module.
TABLES = previous.TABLES + ('view_once_payloads', 'group_view_once_payloads',
                           'group_view_once_deliveries')
NEW_TABLES = ('account_wallets',)
OMIT_COLUMNS = {'login_sessions': ('wallet_ecosystem', 'wallet_address')}
COUNTER_CHECKS = previous.COUNTER_CHECKS.replace('tgrelid)=97', 'tgrelid)=99')
GLOBAL_CHECK = previous.GLOBAL_CHECK.replace('sources<>97', 'sources<>99')
SESSION_COLUMNS = """FROM information_schema.columns WHERE table_schema='hash_talk'
 AND table_name='login_sessions'
 AND column_name IN ('wallet_ecosystem','wallet_address')"""
ABSENT = """SELECT to_regclass('hash_talk.account_wallets') IS NULL
 AND NOT EXISTS(SELECT 1 """ + SESSION_COLUMNS + ')'
SCHEMA_CHECK = """SELECT
 NOT EXISTS(SELECT 1 FROM hash_talk.account_wallets)
 AND (SELECT count(*)=2 AND bool_and(indisvalid AND indisready) FROM pg_index
   WHERE indrelid='hash_talk.account_wallets'::regclass)
 AND NOT EXISTS(SELECT 1 FROM pg_constraint
   WHERE conrelid='hash_talk.account_wallets'::regclass AND NOT convalidated)
 AND (SELECT count(*)=2 AND bool_and(data_type='text' AND is_nullable='YES'
   AND column_default IS NULL) """ + SESSION_COLUMNS + """)
 AND (SELECT count(*)=1 AND bool_and(convalidated) FROM pg_constraint
   WHERE conrelid='hash_talk.login_sessions'::regclass
   AND conname='login_sessions_wallet')
 AND NOT EXISTS(SELECT 1 FROM hash_talk.login_sessions
   WHERE wallet_ecosystem IS NOT NULL OR wallet_address IS NOT NULL)"""


def review(candidate, live):
    base.reviewed_database(candidate, live, {'before': BEFORE, 'reviewed': REVIEWED,
        'versions': 113, 'previous_versions': 111})
    base.verify_community_tables(TABLES)
    for unit in [base.UNIT, *previous.background.UNITS]:
        name = 'infra/staging/' + unit
        if base.digest(candidate / name) != base.digest(live / name):
            raise RuntimeError('Account wallets do not authorize web/worker unit changes.')
    sql = previous.search.directory.ranking.capacity
    for check in [ABSENT, COUNTER_CHECKS, GLOBAL_CHECK]:
        if sql.psql('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;' + check + ';ROLLBACK') != b't':
            raise RuntimeError('Account wallet predecessor schema or accounting differs.')


def snapshot():
    batches = previous.search.directory.ranking.batches
    small = tuple(name for name in TABLES if name not in batches.KEYS)
    result = previous.backups.database_snapshot(small, omit_columns=OMIT_COLUMNS,
        version_limit=113, include_reserved=True)
    result['tables'].update(batches.snapshot(previous.backups.node, previous.backups.URL_CHECK))
    return result


def verify_migration(candidate, before):
    after, versions = snapshot(), base.attachment_versions(candidate)
    if (before['versions'] != versions[:111] or after['versions'] != versions
            or before['tables'] != after['tables']):
        raise RuntimeError('Account wallets changed preserved rows, accounting or checksums.')
    base.verify_community_tables(TABLES + NEW_TABLES)
    sql = previous.search.directory.ranking.capacity
    if any(sql.psql(check) != b't' for check in [SCHEMA_CHECK, COUNTER_CHECKS, GLOBAL_CHECK]):
        raise RuntimeError('Account wallet schema or capacity reconciliation failed.')


def activate(config, work, candidate, before_state):
    if config.get('account_wallets') is not True:
        raise RuntimeError('Account wallets require explicit --account-wallets approval.')
    background = previous.background
    background.verify_current(config)
    previous.search.directory.ranking.parts.require_workers()
    result = base.activate_database(config, work, candidate, {
        'before_state': before_state, 'review': review, 'snapshot': snapshot,
        'versions': 111, 'verify': verify_migration,
        'stop_existing': background.stop, 'resume_existing': background.start,
        'start': background.start,
    })
    result['account_wallet_schema_versions'] = 113
    base.receipt(work, result)
    return result
