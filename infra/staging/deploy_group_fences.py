"""Exact 097→098 finite group cut transition inside the existing release executor.

Owner-approved on 21/10/2026: groups gain a removal fence; packet bodies,
journal rows and every other column stay byte-identical."""
import deploy_remote as base
import deploy_blocks45 as backups
import deploy_background as background
import deploy_post_search as previous

BEFORE = 'c20f46ad236211f0d758935354417454d52ccca7'
REVIEWED = '2bb9cba61421b807b936ddc4198344a7edc2fbe4'
TABLES = previous.TABLES
OMIT_COLUMNS = {'groups': ('message_invalidation',)}
FUNCTION = "pg_get_functiondef('hash_talk.record_group_message_change()'::regprocedure)"
SEQUENCE = """(SELECT seqcache=1 FROM pg_sequence WHERE seqrelid=
 pg_get_serial_sequence('hash_talk.group_packets','sequence')::regclass)"""
TRIGGERS = """(SELECT count(*)=2 FROM pg_trigger WHERE NOT tgisinternal AND tgenabled='O'
 AND ((tgrelid='hash_talk.group_packets'::regclass AND tgname='group_packet_changes')
 OR (tgrelid='hash_talk.group_media'::regclass AND tgname='group_media_changes')))"""
ABSENT = """SELECT NOT EXISTS(SELECT 1 FROM information_schema.columns
 WHERE table_schema='hash_talk' AND table_name='groups' AND column_name='message_invalidation')
 AND position('removal' IN """ + FUNCTION + """)=0
 AND """ + SEQUENCE + """ AND """ + TRIGGERS
SCHEMA_CHECK = """SELECT
 (SELECT count(*)=1 FROM information_schema.columns WHERE table_schema='hash_talk'
 AND table_name='groups' AND column_name='message_invalidation' AND data_type='bigint'
 AND is_nullable='NO' AND column_default='0')
 AND EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='hash_talk.groups'::regclass
 AND conname='group_message_invalidation' AND contype='c' AND convalidated
 AND pg_get_constraintdef(oid) LIKE '%message_invalidation >= 0%'
 AND pg_get_constraintdef(oid) LIKE '%message_invalidation <= message_revision%')
 AND NOT EXISTS(SELECT 1 FROM hash_talk.groups WHERE message_invalidation<>message_revision)
 AND position($guard$removal:=NEW.status='deleting'$guard$ IN """ + FUNCTION + """)>0
 AND position($guard$message_invalidation=CASE WHEN removal THEN message_revision+1 ELSE message_invalidation END$guard$ IN """ + FUNCTION + """)>0
 AND """ + SEQUENCE + """ AND """ + TRIGGERS
COUNTER_CHECKS = previous.COUNTER_CHECKS
GLOBAL_CHECK = previous.GLOBAL_CHECK


def review(candidate, live):
    base.reviewed_database(candidate, live, {'before': BEFORE, 'reviewed': REVIEWED,
        'versions': 98, 'previous_versions': 97})
    base.verify_community_tables(TABLES)
    for unit in [base.UNIT, *background.UNITS]:
        name = 'infra/staging/' + unit
        if base.digest(candidate / name) != base.digest(live / name):
            raise RuntimeError('Group message fences do not authorize unit changes.')
    # Writers are still online during review: each audit reads one stable view.
    if any(previous.directory.ranking.capacity.psql(
            'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;' + sql + ';ROLLBACK') != b't'
           for sql in [ABSENT, COUNTER_CHECKS, GLOBAL_CHECK]):
        raise RuntimeError('Group message fence predecessor schema, sequence or accounting differs.')


def snapshot():
    batches = previous.directory.ranking.batches
    small = tuple(name for name in TABLES if name not in batches.KEYS)
    result = backups.database_snapshot(small, omit_columns=OMIT_COLUMNS,
        version_limit=98, include_reserved=True)
    result['tables'].update(batches.snapshot(backups.node, backups.URL_CHECK))
    return result


def verify_migration(candidate, before):
    after, versions = snapshot(), base.attachment_versions(candidate)
    if (before['versions'] != versions[:97] or after['versions'] != versions
            or before['tables'] != after['tables']):
        raise RuntimeError('Group message fences changed preserved data, accounting or migration history.')
    base.verify_community_tables(TABLES)
    if any(previous.directory.ranking.capacity.psql(sql) != b't' for sql in
           [SCHEMA_CHECK, COUNTER_CHECKS, GLOBAL_CHECK]):
        raise RuntimeError('Group message fence schema, trigger or capacity reconciliation failed.')


def activate(config, work, candidate, before_state):
    if config.get('group_fences') is not True:
        raise RuntimeError('Group message fences require explicit --group-fences approval.')
    background.verify_current(config)
    previous.directory.ranking.parts.require_workers()
    result = base.activate_database(config, work, candidate, {
        'before_state': before_state, 'review': review, 'snapshot': snapshot,
        'versions': 97, 'verify': verify_migration,
        'stop_existing': background.stop, 'resume_existing': background.start,
        'start': background.start,
    })
    result['group_fences_schema_versions'] = 98
    base.receipt(work, result)
    return result
