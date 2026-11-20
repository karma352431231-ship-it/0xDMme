"""Reviewed 113→114 public profile mutes.

Internal transition of deploy.py only. Migration 114 adds the empty
public_profile_mutes table (no quota trigger; the store bounds rows per
profile). Every old row, quota ledger and migration checksum is preserved.
The owner approved activating it on 20/11/2026.
"""
import deploy_remote as base
import deploy_account_wallets as wallets

BEFORE = '9021093e1d6e30397745473de446ba97fd6c17ca'
REVIEWED = 'f755db0a0a895dadeb111477d47f683237f25beb'
previous = wallets.previous
# State after 113 (deploy_account_wallets).
TABLES = wallets.TABLES + wallets.NEW_TABLES
NEW_TABLES = ('public_profile_mutes',)
COUNTER_CHECKS = wallets.COUNTER_CHECKS
GLOBAL_CHECK = wallets.GLOBAL_CHECK
ABSENT = "SELECT to_regclass('hash_talk.public_profile_mutes') IS NULL"
SCHEMA_CHECK = """SELECT
 NOT EXISTS(SELECT 1 FROM hash_talk.public_profile_mutes)
 AND (SELECT count(*)=2 AND bool_and(indisvalid AND indisready) FROM pg_index
   WHERE indrelid='hash_talk.public_profile_mutes'::regclass)
 AND (SELECT count(*)=5 FROM pg_constraint
   WHERE conrelid='hash_talk.public_profile_mutes'::regclass AND convalidated)
 AND NOT EXISTS(SELECT 1 FROM pg_trigger
   WHERE tgrelid='hash_talk.public_profile_mutes'::regclass AND NOT tgisinternal)"""


def review(candidate, live):
    base.reviewed_database(candidate, live, {'before': BEFORE, 'reviewed': REVIEWED,
        'versions': 114, 'previous_versions': 113})
    base.verify_community_tables(TABLES)
    for unit in [base.UNIT, *previous.background.UNITS]:
        name = 'infra/staging/' + unit
        if base.digest(candidate / name) != base.digest(live / name):
            raise RuntimeError('Profile mutes do not authorize web/worker unit changes.')
    sql = previous.search.directory.ranking.capacity
    for check in [ABSENT, COUNTER_CHECKS, GLOBAL_CHECK]:
        if sql.psql('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;' + check + ';ROLLBACK') != b't':
            raise RuntimeError('Profile mute predecessor schema or accounting differs.')


def snapshot():
    batches = previous.search.directory.ranking.batches
    small = tuple(name for name in TABLES if name not in batches.KEYS)
    result = previous.backups.database_snapshot(small, version_limit=114,
        include_reserved=True)
    result['tables'].update(batches.snapshot(previous.backups.node, previous.backups.URL_CHECK))
    return result


def verify_migration(candidate, before):
    after, versions = snapshot(), base.attachment_versions(candidate)
    if (before['versions'] != versions[:113] or after['versions'] != versions
            or before['tables'] != after['tables']):
        raise RuntimeError('Profile mutes changed preserved rows, accounting or checksums.')
    base.verify_community_tables(TABLES + NEW_TABLES)
    sql = previous.search.directory.ranking.capacity
    if any(sql.psql(check) != b't' for check in [SCHEMA_CHECK, COUNTER_CHECKS, GLOBAL_CHECK]):
        raise RuntimeError('Profile mute schema or capacity reconciliation failed.')


def activate(config, work, candidate, before_state):
    if config.get('profile_mutes') is not True:
        raise RuntimeError('Profile mutes require explicit --profile-mutes approval.')
    background = previous.background
    background.verify_current(config)
    previous.search.directory.ranking.parts.require_workers()
    result = base.activate_database(config, work, candidate, {
        'before_state': before_state, 'review': review, 'snapshot': snapshot,
        'versions': 113, 'verify': verify_migration,
        'stop_existing': background.stop, 'resume_existing': background.start,
        'start': background.start,
    })
    result['profile_mute_schema_versions'] = 114
    base.receipt(work, result)
    return result
