"""Exact 102→103 account engagement fact at commit inside the existing release executor.

Migration 103 makes record_engagement guard the global capacity ledger before
its counter rows, and replaces the account fact trigger with the same function
as a deferred constraint trigger, so a first sign-in holds the ledger only
while it commits. Every table, row, charge, accounting source and migration
001–102 stays byte-identical."""
import deploy_remote as base
import deploy_blocks45 as backups
import deploy_background as background
import deploy_post_search as previous

BEFORE = 'c4773eeff75713704d092e580c20426a188cfaf4'
REVIEWED = 'af52ccf71ec18ed2222ee0847e6a23d0e1db57ac'
# Schema 102's metric tables (deploy_engagement.NEW_TABLES), named here so the
# executor does not also load the 099→102 module within its source budget.
METRIC_TABLES = ('engagement_state', 'engagement_counts', 'engagement_entities',
                 'engagement_contributors', 'engagement_visitors', 'engagement_observations',
                 'engagement_erasure', 'engagement_snapshots', 'engagement_coverage',
                 'engagement_operations', 'engagement_adjustments')
TABLES = previous.TABLES + METRIC_TABLES
# A constraint trigger is not an accounting source: schema 102's 96 remain.
COUNTER_CHECKS = previous.COUNTER_CHECKS.replace('tgrelid)=85', 'tgrelid)=96')
GLOBAL_CHECK = previous.GLOBAL_CHECK.replace('sources<>85', 'sources<>96')
TRIGGER = """FROM pg_trigger WHERE tgrelid='hash_talk.accounts'::regclass
 AND tgname='engagement_account_fact' AND NOT tgisinternal AND tgenabled='O'"""
IMMEDIATE = """SELECT count(*)=1 AND bool_and(NOT tgdeferrable AND tgconstraint=0
 AND pg_get_triggerdef(oid)='CREATE TRIGGER engagement_account_fact AFTER INSERT OR DELETE ON hash_talk.accounts FOR EACH ROW EXECUTE FUNCTION hash_talk.engagement_account_fact(''accounts'')')
 """ + TRIGGER
GUARDED = """SELECT position('hash_talk.guard_content_usage()' IN prosrc)
 < position('INSERT INTO hash_talk.engagement_counts' IN prosrc)
 AND position('hash_talk.guard_content_usage()' IN prosrc)>0
 FROM pg_proc WHERE oid='hash_talk.record_engagement(text,uuid,uuid,bigint,text,text)'::regprocedure"""
SCHEMA_CHECK = """SELECT count(*)=1 AND bool_and(tgdeferrable AND tginitdeferred AND tgconstraint<>0
 AND pg_get_triggerdef(oid)='CREATE CONSTRAINT TRIGGER engagement_account_fact AFTER INSERT OR DELETE ON hash_talk.accounts DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION hash_talk.engagement_account_fact(''accounts'')')
 """ + TRIGGER


def review(candidate, live):
    base.reviewed_database(candidate, live, {'before': BEFORE, 'reviewed': REVIEWED,
        'versions': 103, 'previous_versions': 102})
    base.verify_community_tables(TABLES)
    for unit in [base.UNIT, *background.UNITS]:
        name = 'infra/staging/' + unit
        if base.digest(candidate / name) != base.digest(live / name):
            raise RuntimeError('The account fact change does not authorize unit changes.')
    sql = previous.directory.ranking.capacity
    if sql.psql(IMMEDIATE) != b't' or sql.psql(GUARDED) != b'f':
        raise RuntimeError('Account fact predecessor schema differs.')
    for check in [COUNTER_CHECKS, GLOBAL_CHECK]:
        if sql.psql('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;' + check + ';ROLLBACK') != b't':
            raise RuntimeError('Account fact predecessor accounting differs.')


def snapshot():
    batches = previous.directory.ranking.batches
    small = tuple(name for name in TABLES if name not in batches.KEYS)
    result = backups.database_snapshot(small, version_limit=103, include_reserved=True)
    result['tables'].update(batches.snapshot(backups.node, backups.URL_CHECK))
    return result


def verify_migration(candidate, before):
    after, versions = snapshot(), base.attachment_versions(candidate)
    if (before['versions'] != versions[:102] or after['versions'] != versions
            or before['tables'] != after['tables']):
        raise RuntimeError('The account fact change altered preserved data, accounting or migration history.')
    base.verify_community_tables(TABLES)
    if any(previous.directory.ranking.capacity.psql(sql) != b't' for sql in
           [SCHEMA_CHECK, GUARDED, COUNTER_CHECKS, GLOBAL_CHECK]):
        raise RuntimeError('Account fact trigger or capacity reconciliation failed.')


def activate(config, work, candidate, before_state):
    if config.get('account_engagement') is not True:
        raise RuntimeError('The account fact change requires explicit --account-engagement approval.')
    background.verify_current(config)
    previous.directory.ranking.parts.require_workers()
    result = base.activate_database(config, work, candidate, {
        'before_state': before_state, 'review': review, 'snapshot': snapshot,
        'versions': 102, 'verify': verify_migration,
        'stop_existing': background.stop, 'resume_existing': background.start,
        'start': background.start,
    })
    result['account_engagement_schema_versions'] = 103
    base.receipt(work, result)
    return result
