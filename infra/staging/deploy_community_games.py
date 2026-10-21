"""Exact 096→097 Games catalog transition inside the existing release executor."""
import deploy_remote as base
import deploy_blocks45 as backups
import deploy_background as background
import deploy_post_search as previous

BEFORE = '4cb03517ffa7b9083c6a42a7a685b118fee1497b'
REVIEWED = 'bc5700348a313c21e7c6cbcc9aa2471ffae54e56'
TABLES = previous.TABLES
CATALOG = """SELECT count(*)=1 FROM pg_constraint
 WHERE conrelid='hash_talk.community_classifications'::regclass AND contype='c'
 AND convalidated AND pg_get_constraintdef(oid) LIKE '%topics <@%'
 AND pg_get_constraintdef(oid) {comparison} '%games%'"""
SCHEMA_CHECK = CATALOG.format(comparison='LIKE') + """
 AND (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgenabled='O'
 AND tgrelid='hash_talk.community_classifications'::regclass
 AND tgname='community_classification_fixed')=1
 AND EXISTS(SELECT 1 FROM pg_constraint
 WHERE conrelid='hash_talk.community_classifications'::regclass
 AND conname='community_classification_known_topics' AND convalidated)"""


def review(candidate, live):
    base.reviewed_database(candidate, live, {'before': BEFORE, 'reviewed': REVIEWED,
        'versions': 97, 'previous_versions': 96})
    base.verify_community_tables(TABLES)
    for unit in [base.UNIT, *background.UNITS]:
        name = 'infra/staging/' + unit
        if base.digest(candidate / name) != base.digest(live / name):
            raise RuntimeError('Games catalog migration does not authorize unit changes.')
    if any(previous.directory.ranking.capacity.psql(sql) != b't' for sql in
           [CATALOG.format(comparison='NOT LIKE'), previous.COUNTER_CHECKS, previous.GLOBAL_CHECK]):
        raise RuntimeError('Games catalog predecessor constraint or accounting differs.')


def snapshot():
    batches = previous.directory.ranking.batches
    small = tuple(name for name in TABLES if name not in batches.KEYS)
    result = backups.database_snapshot(small, version_limit=97, include_reserved=True)
    result['tables'].update(batches.snapshot(backups.node, backups.URL_CHECK))
    return result


def verify_migration(candidate, before):
    after, versions = snapshot(), base.attachment_versions(candidate)
    if (before['versions'] != versions[:96] or after['versions'] != versions
            or before['tables'] != after['tables']):
        raise RuntimeError('Games catalog changed preserved rows, accounting or migration history.')
    base.verify_community_tables(TABLES)
    if any(previous.directory.ranking.capacity.psql(sql) != b't' for sql in
           [SCHEMA_CHECK, previous.COUNTER_CHECKS, previous.GLOBAL_CHECK]):
        raise RuntimeError('Games catalog constraint, immutability or capacity verification failed.')


def activate(config, work, candidate, before_state):
    if config.get('community_games') is not True:
        raise RuntimeError('Games catalog requires explicit --community-games approval.')
    background.verify_current(config)
    previous.directory.ranking.parts.require_workers()
    result = base.activate_database(config, work, candidate, {
        'before_state': before_state, 'review': review, 'snapshot': snapshot,
        'versions': 96, 'verify': verify_migration,
        'stop_existing': background.stop, 'resume_existing': background.start,
        'start': background.start,
    })
    result['community_games_schema_versions'] = 97
    base.receipt(work, result)
    return result
