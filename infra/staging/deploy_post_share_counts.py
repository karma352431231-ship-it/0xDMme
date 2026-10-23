"""Exact 098→099 public share count index inside the existing release executor.

Owner-approved on 23/10/2026: one partial index on shared post ids; every
table, row, trigger and accounting source stays byte-identical."""
import deploy_remote as base
import deploy_blocks45 as backups
import deploy_background as background
import deploy_post_search as previous

BEFORE = 'd9722b919a44bfecf055e7706ed036f69c9dff8f'
REVIEWED = '9945a0eb6514cf0574d5d123873c1867c1b42de0'
TABLES = previous.TABLES
# The index adds no accounting source beyond schema 098's existing 85.
COUNTER_CHECKS = previous.COUNTER_CHECKS
GLOBAL_CHECK = previous.GLOBAL_CHECK
ABSENT = "SELECT to_regclass('hash_talk.community_post_share_counts') IS NULL"
SCHEMA_CHECK = """SELECT i.indisvalid AND i.indisready AND NOT i.indisunique
 AND i.indrelid='hash_talk.community_post_shares'::regclass AND a.amname='btree'
 AND i.indnatts=1 AND pg_get_indexdef(i.indexrelid) LIKE '%(post_id)%'
 AND pg_get_expr(i.indpred,i.indrelid)='shared'
 FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid
 JOIN pg_am a ON a.oid=c.relam
 WHERE i.indexrelid=to_regclass('hash_talk.community_post_share_counts')"""


def review(candidate, live):
    base.reviewed_database(candidate, live, {'before': BEFORE, 'reviewed': REVIEWED,
        'versions': 99, 'previous_versions': 98})
    base.verify_community_tables(TABLES)
    for unit in [base.UNIT, *background.UNITS]:
        name = 'infra/staging/' + unit
        if base.digest(candidate / name) != base.digest(live / name):
            raise RuntimeError('Share counts do not authorize unit changes.')
    if previous.directory.ranking.capacity.psql(ABSENT) != b't':
        raise RuntimeError('Share count predecessor schema differs.')


def snapshot():
    batches = previous.directory.ranking.batches
    small = tuple(name for name in TABLES if name not in batches.KEYS)
    result = backups.database_snapshot(small, version_limit=99, include_reserved=True)
    result['tables'].update(batches.snapshot(backups.node, backups.URL_CHECK))
    return result


def verify_migration(candidate, before):
    after, versions = snapshot(), base.attachment_versions(candidate)
    if (before['versions'] != versions[:98] or after['versions'] != versions
            or before['tables'] != after['tables']):
        raise RuntimeError('Share counts changed preserved data, accounting or migration history.')
    base.verify_community_tables(TABLES)
    if any(previous.directory.ranking.capacity.psql(sql) != b't' for sql in
           [SCHEMA_CHECK, COUNTER_CHECKS, GLOBAL_CHECK]):
        raise RuntimeError('Share count index or capacity reconciliation failed.')


def activate(config, work, candidate, before_state):
    if config.get('share_counts') is not True:
        raise RuntimeError('Share counts require explicit --share-counts approval.')
    background.verify_current(config)
    previous.directory.ranking.parts.require_workers()
    result = base.activate_database(config, work, candidate, {
        'before_state': before_state, 'review': review, 'snapshot': snapshot,
        'versions': 98, 'verify': verify_migration,
        'stop_existing': background.stop, 'resume_existing': background.start,
        'start': background.start,
    })
    result['share_counts_schema_versions'] = 99
    base.receipt(work, result)
    return result
