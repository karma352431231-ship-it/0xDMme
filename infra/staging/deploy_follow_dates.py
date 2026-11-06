"""Exact 104→105 dated follows inside the existing release executor.

Migration 105 adds a nullable followed_at column to public_profile_follows,
its check, an index and one trigger that marks the followed profile's ranking
state. Existing follows keep no date: every preserved row except that new
column stays identical, and accounting keeps its 97 sources. Contracts come
from deploy_post_search so 104's module stays out of the source budget."""
import deploy_remote as base
import deploy_blocks45 as backups
import deploy_background as background
import deploy_post_search as search

BEFORE = 'e41a00a9981c149608990e95561206751f3b287e'
REVIEWED = '8e165c837a9538e2c71ccb8366f14e82273cc42c'
# deploy_follow_notices.TABLES: schema 104's preserved tables.
METRIC_TABLES = ('engagement_state', 'engagement_counts', 'engagement_entities',
                 'engagement_contributors', 'engagement_visitors', 'engagement_observations',
                 'engagement_erasure', 'engagement_snapshots', 'engagement_coverage',
                 'engagement_operations', 'engagement_adjustments')
TABLES = search.TABLES + METRIC_TABLES + ('public_follow_notifications',)
OMIT_COLUMNS = {'public_profile_follows': ('followed_at',),
                'content_usage_legacy': ('used_bytes',)}
COUNTER_CHECKS = search.COUNTER_CHECKS.replace('tgrelid)=85', 'tgrelid)=97')
GLOBAL_CHECK = search.GLOBAL_CHECK.replace('sources<>85', 'sources<>97')
ABSENT = """SELECT NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='hash_talk'
 AND table_name='public_profile_follows' AND column_name='followed_at')
 AND to_regprocedure('hash_talk.mark_profile_follow_ranking()') IS NULL"""
SCHEMA_CHECK = """SELECT
 NOT EXISTS(SELECT 1 FROM hash_talk.public_profile_follows WHERE followed_at IS NOT NULL)
 AND (SELECT data_type='timestamp with time zone' AND is_nullable='YES' FROM information_schema.columns
   WHERE table_schema='hash_talk' AND table_name='public_profile_follows' AND column_name='followed_at')
 AND (SELECT convalidated FROM pg_constraint WHERE conrelid='hash_talk.public_profile_follows'::regclass
   AND conname='public_profile_follow_dated')
 AND (SELECT indisvalid AND indisready FROM pg_index WHERE indexrelid=to_regclass('hash_talk.public_profile_follow_arrivals'))
 AND (SELECT count(*)=1 FROM pg_trigger WHERE tgrelid='hash_talk.public_profile_follows'::regclass
   AND tgname='profile_follow_ranking' AND NOT tgisinternal AND tgenabled='O'
   AND tgfoid='hash_talk.mark_profile_follow_ranking()'::regprocedure)"""


def review(candidate, live):
    base.reviewed_database(candidate, live, {'before': BEFORE, 'reviewed': REVIEWED,
        'versions': 105, 'previous_versions': 104})
    base.verify_community_tables(TABLES)
    for unit in [base.UNIT, *background.UNITS]:
        name = 'infra/staging/' + unit
        if base.digest(candidate / name) != base.digest(live / name):
            raise RuntimeError('Dated follows do not authorize unit changes.')
    sql = search.directory.ranking.capacity
    if sql.psql(ABSENT) != b't':
        raise RuntimeError('Dated follow predecessor schema differs.')
    for check in [COUNTER_CHECKS, GLOBAL_CHECK]:
        if sql.psql('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;' + check + ';ROLLBACK') != b't':
            raise RuntimeError('Dated follow predecessor accounting differs.')


def snapshot():
    batches = search.directory.ranking.batches
    small = tuple(name for name in TABLES if name not in batches.KEYS)
    result = backups.database_snapshot(small, omit_columns=OMIT_COLUMNS,
        version_limit=105, include_reserved=True)
    result['tables'].update(batches.snapshot(backups.node, backups.URL_CHECK))
    return result


def verify_migration(candidate, before):
    after, versions = snapshot(), base.attachment_versions(candidate)
    if (before['versions'] != versions[:104] or after['versions'] != versions
            or before['tables'] != after['tables']):
        raise RuntimeError('Dated follows altered preserved data, accounting or migration history.')
    base.verify_community_tables(TABLES)
    if any(search.directory.ranking.capacity.psql(sql) != b't' for sql in
           [SCHEMA_CHECK, COUNTER_CHECKS, GLOBAL_CHECK]):
        raise RuntimeError('Dated follow schema or capacity reconciliation failed.')


def activate(config, work, candidate, before_state):
    if config.get('follow_dates') is not True:
        raise RuntimeError('Dated follows require explicit --follow-dates approval.')
    background.verify_current(config)
    search.directory.ranking.parts.require_workers()
    result = base.activate_database(config, work, candidate, {
        'before_state': before_state, 'review': review, 'snapshot': snapshot,
        'versions': 104, 'verify': verify_migration,
        'stop_existing': background.stop, 'resume_existing': background.start,
        'start': background.start,
    })
    result['follow_date_schema_versions'] = 105
    base.receipt(work, result)
    return result
