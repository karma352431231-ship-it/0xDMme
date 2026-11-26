"""Owner-requested 116→117 video stickers.

Internal transition of deploy.py only. Migration 117 only loosens the
public_stickers type check to also allow 'video/mp4'; no table, row, trigger
or accounting source changes. Every old row, quota ledger and migration
checksum is preserved. Activation still needs the owner's --video-stickers
command.
"""
import deploy_remote as base
import deploy_post_photos as photos

BEFORE = 'a01b998a6c8b61181f5451b0c4c64d184e29213c'
REVIEWED = '6ddb03543fdf4bc2f4a21183516fae969040c38f'
previous = photos.previous
# State after 116 (deploy_post_photos).
TABLES = photos.TABLES
NEW_TABLES = ()
COUNTER_CHECKS = photos.COUNTER_CHECKS
GLOBAL_CHECK = photos.GLOBAL_CHECK
TYPE = """(SELECT pg_get_constraintdef(oid) FROM pg_constraint
 WHERE conrelid='hash_talk.public_stickers'::regclass
 AND conname='public_stickers_type_check')"""
ABSENT = "SELECT " + TYPE + " NOT LIKE '%video/mp4%'"
SCHEMA_CHECK = ("SELECT " + TYPE + " LIKE '%video/mp4%'"
                "\n AND (SELECT convalidated FROM pg_constraint"
                "\n   WHERE conrelid='hash_talk.public_stickers'::regclass"
                "\n   AND conname='public_stickers_type_check')")


def review(candidate, live):
    base.reviewed_database(candidate, live, {'before': BEFORE, 'reviewed': REVIEWED,
        'versions': 117, 'previous_versions': 116})
    base.verify_community_tables(TABLES)
    for unit in [base.UNIT, *previous.background.UNITS]:
        name = 'infra/staging/' + unit
        if base.digest(candidate / name) != base.digest(live / name):
            raise RuntimeError('Video stickers do not authorize web/worker unit changes.')
    sql = previous.search.directory.ranking.capacity
    for check in [ABSENT, COUNTER_CHECKS, GLOBAL_CHECK]:
        if sql.psql('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;' + check + ';ROLLBACK') != b't':
            raise RuntimeError('Video sticker predecessor schema or accounting differs.')


def snapshot():
    batches = previous.search.directory.ranking.batches
    small = tuple(name for name in TABLES if name not in batches.KEYS)
    result = previous.backups.database_snapshot(small, version_limit=117,
        include_reserved=True)
    result['tables'].update(batches.snapshot(previous.backups.node, previous.backups.URL_CHECK))
    return result


def verify_migration(candidate, before):
    after, versions = snapshot(), base.attachment_versions(candidate)
    if (before['versions'] != versions[:116] or after['versions'] != versions
            or before['tables'] != after['tables']):
        raise RuntimeError('Video stickers changed preserved rows, accounting or checksums.')
    base.verify_community_tables(TABLES)
    sql = previous.search.directory.ranking.capacity
    if any(sql.psql(check) != b't' for check in [SCHEMA_CHECK, COUNTER_CHECKS, GLOBAL_CHECK]):
        raise RuntimeError('Video sticker check or capacity reconciliation failed.')


def activate(config, work, candidate, before_state):
    if config.get('video_stickers') is not True:
        raise RuntimeError('Video stickers require explicit --video-stickers approval.')
    background = previous.background
    background.verify_current(config)
    previous.search.directory.ranking.parts.require_workers()
    result = base.activate_database(config, work, candidate, {
        'before_state': before_state, 'review': review, 'snapshot': snapshot,
        'versions': 116, 'verify': verify_migration,
        'stop_existing': background.stop, 'resume_existing': background.start,
        'start': background.start,
    })
    result['video_sticker_schema_versions'] = 117
    base.receipt(work, result)
    return result
