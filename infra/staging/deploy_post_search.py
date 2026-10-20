"""Owner-approved 094→095 search index, an internal deploy.py verifier only."""
import deploy_remote as base
import deploy_blocks45 as backups
import deploy_background as background
import deploy_profile_directory as directory

BEFORE = '56732462ce83400d7b5dffa2a7f4dce081887fa3'
REVIEWED = 'a04abe6b7680cd5a171922e37499a9c2d750e95b'
TABLES = directory.TABLES + ('contact_invitations',)
# The index adds no accounting source beyond schema 094's existing 85.
COUNTER_CHECKS = directory.ranking.COUNTER_CHECKS.replace('tgrelid)=84', 'tgrelid)=85')
GLOBAL_CHECK = directory.ranking.GLOBAL_CHECK.replace('sources<>84', 'sources<>85')
ABSENT = "SELECT to_regclass('hash_talk.community_post_search') IS NULL"
SCHEMA_CHECK = """SELECT i.indisvalid AND i.indisready
 AND i.indrelid='hash_talk.community_posts'::regclass AND a.amname='gin'
 AND pg_get_expr(i.indexprs,i.indrelid) LIKE '%to_tsvector%'
 AND pg_get_expr(i.indexprs,i.indrelid) LIKE '%simple%'
 AND pg_get_expr(i.indexprs,i.indrelid) LIKE '%normalize%'
 FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid
 JOIN pg_am a ON a.oid=c.relam
 WHERE i.indexrelid=to_regclass('hash_talk.community_post_search')"""


def review(candidate, live):
    base.reviewed_database(candidate, live, {'before': BEFORE, 'reviewed': REVIEWED,
        'versions': 95, 'previous_versions': 94})
    base.verify_community_tables(TABLES)
    for unit in [base.UNIT, *background.UNITS]:
        name = 'infra/staging/' + unit
        if base.digest(candidate / name) != base.digest(live / name):
            raise RuntimeError('Post search does not authorize unit changes.')
    if directory.ranking.capacity.psql(ABSENT) != b't':
        raise RuntimeError('Post search predecessor schema differs.')


def snapshot():
    small = tuple(name for name in TABLES if name not in directory.ranking.batches.KEYS)
    result = backups.database_snapshot(small, version_limit=95, include_reserved=True)
    result['tables'].update(directory.ranking.batches.snapshot(backups.node, backups.URL_CHECK))
    return result


def verify_migration(candidate, before):
    after, versions = snapshot(), base.attachment_versions(candidate)
    if (before['versions'] != versions[:94] or after['versions'] != versions
            or before['tables'] != after['tables']):
        raise RuntimeError('Post search changed preserved data, accounting or migration history.')
    base.verify_community_tables(TABLES)
    if any(directory.ranking.capacity.psql(sql) != b't' for sql in
           [SCHEMA_CHECK, COUNTER_CHECKS, GLOBAL_CHECK]):
        raise RuntimeError('Post search index or capacity reconciliation failed.')


def activate(config, work, candidate, before_state):
    if config.get('post_search') is not True:
        raise RuntimeError('Post search migration requires explicit --post-search approval.')
    background.verify_current(config)
    directory.ranking.parts.require_workers()
    result = base.activate_database(config, work, candidate, {
        'before_state': before_state, 'review': review, 'snapshot': snapshot,
        'versions': 94, 'verify': verify_migration,
        'stop_existing': background.stop, 'resume_existing': background.start,
        'start': background.start,
    })
    result['post_search_schema_versions'] = 95
    base.receipt(work, result)
    return result
