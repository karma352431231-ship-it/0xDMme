"""Exact 105→106 visitor retention inside the existing release executor.

Migration 106 adds engagement_visitor_retention() (30 days) and one
visitors_complete_from column on the engagement_state singleton. No table
is created and no preserved row changes except that new column, so the
schema 105 tables and their 97-source accounting come from
deploy_follow_dates unchanged."""
import deploy_remote as base
import deploy_follow_dates as previous

BEFORE = 'c0d09efb562614997c0f35162149aea2a08a0feb'
REVIEWED = '8c7d778b48e7c6b4384d46f781e6ed1e8bc82137'
TABLES = previous.TABLES
OMIT_COLUMNS = {'engagement_state': ('visitors_complete_from',),
                'content_usage_legacy': ('used_bytes',)}
COUNTER_CHECKS = previous.COUNTER_CHECKS
GLOBAL_CHECK = previous.GLOBAL_CHECK
ABSENT = """SELECT to_regprocedure('hash_talk.engagement_visitor_retention()') IS NULL
 AND NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='hash_talk'
   AND table_name='engagement_state' AND column_name='visitors_complete_from')"""
SCHEMA_CHECK = """SELECT
 hash_talk.engagement_visitor_retention()=interval '30 days'
 AND hash_talk.engagement_technical_retention()=interval '7 days'
 AND (SELECT data_type='timestamp with time zone' AND is_nullable='NO' FROM information_schema.columns
   WHERE table_schema='hash_talk' AND table_name='engagement_state' AND column_name='visitors_complete_from')
 AND (SELECT count(*)=1 AND bool_and(visitors_complete_from<=clock_timestamp()-interval '7 days')
   FROM hash_talk.engagement_state)"""


def review(candidate, live):
    base.reviewed_database(candidate, live, {'before': BEFORE, 'reviewed': REVIEWED,
        'versions': 106, 'previous_versions': 105})
    base.verify_community_tables(TABLES)
    for unit in [base.UNIT, *previous.background.UNITS]:
        name = 'infra/staging/' + unit
        if base.digest(candidate / name) != base.digest(live / name):
            raise RuntimeError('Visitor retention does not authorize unit changes.')
    sql = previous.search.directory.ranking.capacity
    if sql.psql(ABSENT) != b't':
        raise RuntimeError('Visitor retention predecessor schema differs.')
    for check in [COUNTER_CHECKS, GLOBAL_CHECK]:
        if sql.psql('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;' + check + ';ROLLBACK') != b't':
            raise RuntimeError('Visitor retention predecessor accounting differs.')


def snapshot():
    batches = previous.search.directory.ranking.batches
    small = tuple(name for name in TABLES if name not in batches.KEYS)
    result = previous.backups.database_snapshot(small, omit_columns=OMIT_COLUMNS,
        version_limit=106, include_reserved=True)
    result['tables'].update(batches.snapshot(previous.backups.node, previous.backups.URL_CHECK))
    return result


def verify_migration(candidate, before):
    after, versions = snapshot(), base.attachment_versions(candidate)
    if (before['versions'] != versions[:105] or after['versions'] != versions
            or before['tables'] != after['tables']):
        raise RuntimeError('Visitor retention altered preserved data, accounting or migration history.')
    base.verify_community_tables(TABLES)
    if any(previous.search.directory.ranking.capacity.psql(sql) != b't' for sql in
           [SCHEMA_CHECK, COUNTER_CHECKS, GLOBAL_CHECK]):
        raise RuntimeError('Visitor retention schema or capacity reconciliation failed.')


def activate(config, work, candidate, before_state):
    if config.get('visitor_retention') is not True:
        raise RuntimeError('Visitor retention requires explicit --visitor-retention approval.')
    previous.background.verify_current(config)
    previous.search.directory.ranking.parts.require_workers()
    result = base.activate_database(config, work, candidate, {
        'before_state': before_state, 'review': review, 'snapshot': snapshot,
        'versions': 105, 'verify': verify_migration,
        'stop_existing': previous.background.stop, 'resume_existing': previous.background.start,
        'start': previous.background.start,
    })
    result['visitor_retention_schema_versions'] = 106
    base.receipt(work, result)
    return result
