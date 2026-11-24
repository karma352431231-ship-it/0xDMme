"""Owner-approved 114→115 public stickers and packs.

Internal transition of deploy.py only. Migration 115 widens the
public_moderation kind check with 'sticker' and adds four empty tables
(public_stickers, public_sticker_packs, public_sticker_pack_items,
public_sticker_pack_adds), each charged to content capacity through the
statement usage trigger. Every old row, quota ledger and migration checksum
is preserved. Activation still needs the owner's --public-stickers command.
"""
import deploy_remote as base
import deploy_profile_mutes as mutes

BEFORE = '6ee548e10e0c233886b272819eac358834af5790'
REVIEWED = '1e5a5537b7cf10444324db915ff7dd2aa9baba8c'
previous = mutes.previous
# State after 114 (deploy_profile_mutes).
TABLES = mutes.TABLES + mutes.NEW_TABLES
NEW_TABLES = ('public_stickers', 'public_sticker_packs',
              'public_sticker_pack_items', 'public_sticker_pack_adds')
# Each new table carries the three statement usage triggers.
COUNTER_CHECKS = mutes.COUNTER_CHECKS.replace('tgrelid)=99', 'tgrelid)=103')
GLOBAL_CHECK = mutes.GLOBAL_CHECK.replace('sources<>99', 'sources<>103')
KIND = """(SELECT pg_get_constraintdef(oid) FROM pg_constraint
 WHERE conrelid='hash_talk.public_moderation'::regclass
 AND conname='public_moderation_kind_check')"""
ABSENT = ("SELECT to_regclass('hash_talk.public_stickers') IS NULL AND "
          + KIND + " NOT LIKE '%''sticker''%'")
# Table → (indexes, constraints); every one of them has 3 usage triggers only.
SHAPE = {'public_stickers': (2, 8), 'public_sticker_packs': (3, 4),
         'public_sticker_pack_items': (2, 5), 'public_sticker_pack_adds': (2, 4)}


def table_check(name, indexes, constraints):
    table = "'hash_talk.%s'::regclass" % name
    return f"""NOT EXISTS(SELECT 1 FROM hash_talk.{name})
 AND (SELECT count(*)={indexes} AND bool_and(indisvalid AND indisready) FROM pg_index
   WHERE indrelid={table})
 AND (SELECT count(*)={constraints} AND bool_and(convalidated) FROM pg_constraint
   WHERE conrelid={table})
 AND (SELECT count(*)=3 AND bool_and(tgenabled='O'
   AND tgfoid='hash_talk.track_statement_content_usage()'::regprocedure)
   FROM pg_trigger WHERE tgrelid={table} AND NOT tgisinternal)"""


SCHEMA_CHECK = ('SELECT ' + '\n AND '.join(
    table_check(name, *shape) for name, shape in SHAPE.items())
    + "\n AND " + KIND + " LIKE '%''post-media''%''sticker''%'")


def review(candidate, live):
    base.reviewed_database(candidate, live, {'before': BEFORE, 'reviewed': REVIEWED,
        'versions': 115, 'previous_versions': 114})
    base.verify_community_tables(TABLES)
    for unit in [base.UNIT, *previous.background.UNITS]:
        name = 'infra/staging/' + unit
        if base.digest(candidate / name) != base.digest(live / name):
            raise RuntimeError('Public stickers do not authorize web/worker unit changes.')
    sql = previous.search.directory.ranking.capacity
    for check in [ABSENT, mutes.COUNTER_CHECKS, mutes.GLOBAL_CHECK]:
        if sql.psql('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;' + check + ';ROLLBACK') != b't':
            raise RuntimeError('Public sticker predecessor schema or accounting differs.')


def snapshot():
    batches = previous.search.directory.ranking.batches
    small = tuple(name for name in TABLES if name not in batches.KEYS)
    result = previous.backups.database_snapshot(small, version_limit=115,
        include_reserved=True)
    result['tables'].update(batches.snapshot(previous.backups.node, previous.backups.URL_CHECK))
    return result


def verify_migration(candidate, before):
    after, versions = snapshot(), base.attachment_versions(candidate)
    if (before['versions'] != versions[:114] or after['versions'] != versions
            or before['tables'] != after['tables']):
        raise RuntimeError('Public stickers changed preserved rows, accounting or checksums.')
    base.verify_community_tables(TABLES + NEW_TABLES)
    sql = previous.search.directory.ranking.capacity
    if any(sql.psql(check) != b't' for check in [SCHEMA_CHECK, COUNTER_CHECKS, GLOBAL_CHECK]):
        raise RuntimeError('Public sticker schema or capacity reconciliation failed.')


def activate(config, work, candidate, before_state):
    if config.get('public_stickers') is not True:
        raise RuntimeError('Public stickers require explicit --public-stickers approval.')
    background = previous.background
    background.verify_current(config)
    previous.search.directory.ranking.parts.require_workers()
    result = base.activate_database(config, work, candidate, {
        'before_state': before_state, 'review': review, 'snapshot': snapshot,
        'versions': 114, 'verify': verify_migration,
        'stop_existing': background.stop, 'resume_existing': background.start,
        'start': background.start,
    })
    result['public_sticker_schema_versions'] = 115
    base.receipt(work, result)
    return result
