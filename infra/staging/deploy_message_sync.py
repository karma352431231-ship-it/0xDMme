"""Exact 095→096 synchronization transition inside the existing release executor."""
import deploy_remote as base
import deploy_blocks45 as backups
import deploy_background as background
import deploy_post_search as previous

BEFORE = 'e4891ce2f221015a75657712a59b63a1060abce4'
REVIEWED = 'ebbd6e0e8e8d159ab7b78f9a0c9296c6e6e7d3c0'
TABLES = previous.TABLES
OMIT_COLUMNS = {'message_heads': ('invalidation_revision',)}
JOURNAL_COLUMNS = {'message_changes': ('change_kind',)}
ABSENT = """SELECT NOT EXISTS(SELECT 1 FROM information_schema.columns
 WHERE table_schema='hash_talk' AND ((table_name='message_heads' AND column_name='invalidation_revision')
 OR (table_name='message_changes' AND column_name='change_kind')))
 AND (SELECT seqcache=1 FROM pg_sequence WHERE seqrelid=
 pg_get_serial_sequence('hash_talk.message_packets','sequence')::regclass)"""
SCHEMA_CHECK = """SELECT
 (SELECT count(*)=1 FROM information_schema.columns WHERE table_schema='hash_talk'
 AND table_name='message_heads' AND column_name='invalidation_revision' AND data_type='bigint'
 AND is_nullable='NO' AND column_default='0')
 AND (SELECT count(*)=1 FROM information_schema.columns WHERE table_schema='hash_talk'
 AND table_name='message_changes' AND column_name='change_kind' AND data_type='text'
 AND is_nullable='NO' AND column_default=$default$'legacy'::text$default$)
 AND EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='hash_talk.message_heads'::regclass
 AND contype='c' AND convalidated AND pg_get_constraintdef(oid) LIKE '%invalidation_revision >= 0%'
 AND pg_get_constraintdef(oid) LIKE '%invalidation_revision <= revision%')
 AND EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='hash_talk.message_changes'::regclass
 AND contype='c' AND convalidated AND pg_get_constraintdef(oid) LIKE '%change_kind%legacy%append%remove%reset%')
 AND NOT EXISTS(SELECT 1 FROM hash_talk.message_heads WHERE invalidation_revision<>0)
 AND NOT EXISTS(SELECT 1 FROM hash_talk.message_changes WHERE change_kind<>'legacy')
 AND (SELECT seqcache=1 FROM pg_sequence WHERE seqrelid=
 pg_get_serial_sequence('hash_talk.message_packets','sequence')::regclass)
 AND position($guard$after_row->>'change_kind'='append'$guard$ IN
 pg_get_functiondef('hash_talk.consume_message_admission(text,jsonb,jsonb,text,bigint)'::regprocedure))>0
 AND position($guard$(after_row->>'invalidation_revision')::bigint=(after_row->>'revision')::bigint$guard$ IN
 pg_get_functiondef('hash_talk.consume_message_removal_metadata(text,jsonb,jsonb,text,bigint)'::regprocedure))>0
 AND position($guard$after_row->>'change_kind'=CASE WHEN kind='clean' THEN 'reset' ELSE 'remove' END$guard$ IN
 pg_get_functiondef('hash_talk.consume_message_removal_metadata(text,jsonb,jsonb,text,bigint)'::regprocedure))>0"""
COUNTER_CHECKS = previous.COUNTER_CHECKS
GLOBAL_CHECK = previous.GLOBAL_CHECK


def review(candidate, live):
    base.reviewed_database(candidate, live, {'before': BEFORE, 'reviewed': REVIEWED,
        'versions': 96, 'previous_versions': 95})
    base.verify_community_tables(TABLES)
    for unit in [base.UNIT, *background.UNITS]:
        name = 'infra/staging/' + unit
        if base.digest(candidate / name) != base.digest(live / name):
            raise RuntimeError('Message synchronization does not authorize unit changes.')
    if previous.directory.ranking.capacity.psql(ABSENT) != b't':
        raise RuntimeError('Message synchronization predecessor schema or sequence cache differs.')


def snapshot():
    batches = previous.directory.ranking.batches
    small = tuple(name for name in TABLES if name not in batches.KEYS)
    result = backups.database_snapshot(small, omit_columns=OMIT_COLUMNS,
        version_limit=96, include_reserved=True)
    result['tables'].update(batches.snapshot(backups.node, backups.URL_CHECK,
        omit_columns=JOURNAL_COLUMNS))
    return result


def verify_migration(candidate, before):
    after, versions = snapshot(), base.attachment_versions(candidate)
    if (before['versions'] != versions[:95] or after['versions'] != versions
            or before['tables'] != after['tables']):
        raise RuntimeError('Message synchronization changed preserved data, accounting or migration history.')
    base.verify_community_tables(TABLES)
    if any(previous.directory.ranking.capacity.psql(sql) != b't' for sql in
           [SCHEMA_CHECK, COUNTER_CHECKS, GLOBAL_CHECK]):
        raise RuntimeError('Message synchronization schema, guards or capacity reconciliation failed.')


def activate(config, work, candidate, before_state):
    if config.get('message_sync') is not True:
        raise RuntimeError('Message synchronization requires explicit --message-sync approval.')
    background.verify_current(config)
    previous.directory.ranking.parts.require_workers()
    result = base.activate_database(config, work, candidate, {
        'before_state': before_state, 'review': review, 'snapshot': snapshot,
        'versions': 95, 'verify': verify_migration,
        'stop_existing': background.stop, 'resume_existing': background.start,
        'start': background.start,
    })
    result['message_sync_schema_versions'] = 96
    base.receipt(work, result)
    return result
