"""Exact 103→104 follower notice table inside the existing release executor.

Migration 104 adds one empty, charged notice table and no backfill; every
table, row, charge and migration 001–103 stays identical. Accounting sources
grow from 96 to 97. Contracts come from deploy_post_search, as 103's do,
without loading 103's module within the executor source budget."""
import deploy_remote as base
import deploy_blocks45 as backups
import deploy_background as background
import deploy_post_search as search

BEFORE = 'ad886b2a1d6767c64fa3af98451ea89f8f4285e9'
REVIEWED = '250ecc9052f6b3d80d6ebd79765ec1a1d50a2c5f'
TABLE = 'public_follow_notifications'
# deploy_account_engagement.METRIC_TABLES and its schema 103 accounting.
METRIC_TABLES = ('engagement_state', 'engagement_counts', 'engagement_entities',
                 'engagement_contributors', 'engagement_visitors', 'engagement_observations',
                 'engagement_erasure', 'engagement_snapshots', 'engagement_coverage',
                 'engagement_operations', 'engagement_adjustments')
TABLES = search.TABLES + METRIC_TABLES
PREVIOUS_COUNTER = search.COUNTER_CHECKS.replace('tgrelid)=85', 'tgrelid)=96')
PREVIOUS_GLOBAL = search.GLOBAL_CHECK.replace('sources<>85', 'sources<>96')
COUNTER_CHECKS = search.COUNTER_CHECKS.replace('tgrelid)=85', 'tgrelid)=97')
GLOBAL_CHECK = search.GLOBAL_CHECK.replace('sources<>85', 'sources<>97')
ABSENT = "SELECT to_regclass('hash_talk.public_follow_notifications') IS NULL"
SCHEMA_CHECK = """SELECT
 NOT EXISTS(SELECT 1 FROM hash_talk.public_follow_notifications)
 AND (SELECT count(*)=6 FROM information_schema.columns WHERE table_schema='hash_talk' AND table_name='public_follow_notifications')
 AND (SELECT count(*)=3 FROM pg_trigger WHERE tgrelid='hash_talk.public_follow_notifications'::regclass
   AND NOT tgisinternal AND tgenabled='O'
   AND tgname IN ('content_allocation_source','content_usage_insert','content_usage_delete'))
 AND (SELECT count(*)=3 FROM pg_trigger WHERE tgrelid='hash_talk.public_follow_notifications'::regclass AND NOT tgisinternal)
 AND (SELECT count(*)=6 FROM pg_constraint WHERE conrelid='hash_talk.public_follow_notifications'::regclass AND convalidated)
 AND (SELECT indisvalid AND indisready FROM pg_index WHERE indexrelid=to_regclass('hash_talk.public_follow_notification_page'))
 AND (SELECT reloptions @> ARRAY['autovacuum_vacuum_scale_factor=0.05','autovacuum_vacuum_threshold=20']
   FROM pg_class WHERE oid='hash_talk.public_follow_notifications'::regclass)"""


def review(candidate, live):
    base.reviewed_database(candidate, live, {'before': BEFORE, 'reviewed': REVIEWED,
        'versions': 104, 'previous_versions': 103})
    base.verify_community_tables(TABLES)
    for unit in [base.UNIT, *background.UNITS]:
        name = 'infra/staging/' + unit
        if base.digest(candidate / name) != base.digest(live / name):
            raise RuntimeError('Follower notices do not authorize unit changes.')
    sql = search.directory.ranking.capacity
    if sql.psql(ABSENT) != b't':
        raise RuntimeError('Follower notice predecessor schema differs.')
    for check in [PREVIOUS_COUNTER, PREVIOUS_GLOBAL]:
        if sql.psql('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;' + check + ';ROLLBACK') != b't':
            raise RuntimeError('Follower notice predecessor accounting differs.')


def snapshot():
    batches = search.directory.ranking.batches
    small = tuple(name for name in TABLES if name not in batches.KEYS)
    result = backups.database_snapshot(small, version_limit=104, include_reserved=True)
    result['tables'].update(batches.snapshot(backups.node, backups.URL_CHECK))
    return result


def verify_migration(candidate, before):
    after, versions = snapshot(), base.attachment_versions(candidate)
    if (before['versions'] != versions[:103] or after['versions'] != versions
            or before['tables'] != after['tables']):
        raise RuntimeError('Follower notices altered preserved data, accounting or migration history.')
    base.verify_community_tables(TABLES + (TABLE,))
    if any(search.directory.ranking.capacity.psql(sql) != b't' for sql in
           [SCHEMA_CHECK, COUNTER_CHECKS, GLOBAL_CHECK]):
        raise RuntimeError('Follower notice schema or capacity reconciliation failed.')


def activate(config, work, candidate, before_state):
    if config.get('follow_notices') is not True:
        raise RuntimeError('Follower notices require explicit --follow-notices approval.')
    background.verify_current(config)
    search.directory.ranking.parts.require_workers()
    result = base.activate_database(config, work, candidate, {
        'before_state': before_state, 'review': review, 'snapshot': snapshot,
        'versions': 103, 'verify': verify_migration,
        'stop_existing': background.stop, 'resume_existing': background.start,
        'start': background.start,
    })
    result['follow_notice_schema_versions'] = 104
    base.receipt(work, result)
    return result
