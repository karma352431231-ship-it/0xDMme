"""Owner-requested 115→116 ten photos per post.

Internal transition of deploy.py only. Migration 116 only loosens the
community_posts content check from 4 to 10 media items; no table, row,
trigger or accounting source changes. Every old row, quota ledger and
migration checksum is preserved. Activation still needs the owner's
--post-photos command.
"""
import deploy_remote as base
import deploy_public_stickers as stickers

BEFORE = '0b38c90b1151ac85f7e3e50389f71df348aba225'
REVIEWED = '5acb84cdc63092ddea9ab1d839e010731e333d11'
previous = stickers.previous
# State after 115 (deploy_public_stickers).
TABLES = stickers.TABLES + stickers.NEW_TABLES
NEW_TABLES = ()
COUNTER_CHECKS = stickers.COUNTER_CHECKS
GLOBAL_CHECK = stickers.GLOBAL_CHECK
CONTENT = """(SELECT pg_get_constraintdef(oid) FROM pg_constraint
 WHERE conrelid='hash_talk.community_posts'::regclass
 AND conname='community_post_content')"""
ABSENT = "SELECT " + CONTENT + " LIKE '%cardinality(media_ids) <= 4)%'"
SCHEMA_CHECK = ("SELECT " + CONTENT + " LIKE '%cardinality(media_ids) <= 10)%'"
                "\n AND (SELECT convalidated FROM pg_constraint"
                "\n   WHERE conrelid='hash_talk.community_posts'::regclass"
                "\n   AND conname='community_post_content')")


def review(candidate, live):
    base.reviewed_database(candidate, live, {'before': BEFORE, 'reviewed': REVIEWED,
        'versions': 116, 'previous_versions': 115})
    base.verify_community_tables(TABLES)
    for unit in [base.UNIT, *previous.background.UNITS]:
        name = 'infra/staging/' + unit
        if base.digest(candidate / name) != base.digest(live / name):
            raise RuntimeError('Ten post photos do not authorize web/worker unit changes.')
    sql = previous.search.directory.ranking.capacity
    for check in [ABSENT, COUNTER_CHECKS, GLOBAL_CHECK]:
        if sql.psql('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;' + check + ';ROLLBACK') != b't':
            raise RuntimeError('Post photo predecessor schema or accounting differs.')


def snapshot():
    batches = previous.search.directory.ranking.batches
    small = tuple(name for name in TABLES if name not in batches.KEYS)
    result = previous.backups.database_snapshot(small, version_limit=116,
        include_reserved=True)
    result['tables'].update(batches.snapshot(previous.backups.node, previous.backups.URL_CHECK))
    return result


def verify_migration(candidate, before):
    after, versions = snapshot(), base.attachment_versions(candidate)
    if (before['versions'] != versions[:115] or after['versions'] != versions
            or before['tables'] != after['tables']):
        raise RuntimeError('Ten post photos changed preserved rows, accounting or checksums.')
    base.verify_community_tables(TABLES)
    sql = previous.search.directory.ranking.capacity
    if any(sql.psql(check) != b't' for check in [SCHEMA_CHECK, COUNTER_CHECKS, GLOBAL_CHECK]):
        raise RuntimeError('Post photo check or capacity reconciliation failed.')


def activate(config, work, candidate, before_state):
    if config.get('post_photos') is not True:
        raise RuntimeError('Ten post photos require explicit --post-photos approval.')
    background = previous.background
    background.verify_current(config)
    previous.search.directory.ranking.parts.require_workers()
    result = base.activate_database(config, work, candidate, {
        'before_state': before_state, 'review': review, 'snapshot': snapshot,
        'versions': 115, 'verify': verify_migration,
        'stop_existing': background.stop, 'resume_existing': background.start,
        'start': background.start,
    })
    result['post_photo_schema_versions'] = 116
    base.receipt(work, result)
    return result
