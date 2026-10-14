"""Exact 064→066 message transition through npm run deploy:staging only."""
import re
import deploy_remote as base
import deploy_blocks45 as backups
import deploy_background as background
import deploy_mentions as mentions

BEFORE = '841931120e2315db895e3af91f04d7e24c351172'
REVIEWED = 'fc76aea996c728fe053618dfd6f313b6f19f90ad'
OLD_TABLES = mentions.OLD_TABLES + mentions.NEW_TABLES
NEW_TABLES = ('message_changes', 'group_message_changes')
OMIT_COLUMNS = {'groups': ('message_revision',), 'group_packets': ('relation',)}


def review(candidate, live):
    if not re.fullmatch(r'[a-f0-9]{40}', REVIEWED):
        raise RuntimeError('Message migration requires an exact source review.')
    base.reviewed_database(candidate, live, {
        'before': BEFORE, 'reviewed': REVIEWED, 'versions': 66, 'previous_versions': 64,
    })
    base.verify_community_tables(OLD_TABLES)
    for unit in [base.UNIT, *background.UNITS]:
        if base.digest(candidate / 'infra/staging' / unit) != base.digest(live / 'infra/staging' / unit):
            raise RuntimeError('Message migration does not authorize service unit changes.')
    sql = """SELECT to_regclass('hash_talk.message_changes') IS NULL
      AND to_regclass('hash_talk.group_message_changes') IS NULL
      AND NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='hash_talk'
        AND ((table_name='groups' AND column_name='message_revision') OR
             (table_name='group_packets' AND column_name='relation')))"""
    if backups.pg(['psql', '--no-psqlrc', '--set=ON_ERROR_STOP=1', '--tuples-only', '--no-align', '-c', sql]).strip() != b't':
        raise RuntimeError('Message metadata tables/columns already exist; migration refused.')


def snapshot():
    # New columns default to 0/NULL. Omit only these additions when comparing
    # all legacy rows; retain ciphertext, deletion proofs and capacity ledger.
    return backups.database_snapshot(OLD_TABLES, omit_columns=OMIT_COLUMNS, version_limit=66)


def verify_migration(candidate, before):
    after, versions = snapshot(), base.attachment_versions(candidate)
    if (before['versions'] != versions[:64] or after['versions'] != versions
            or after['tables'] != before['tables']):
        raise RuntimeError('Message migration changed existing rows, ledger or checksums.')
    base.verify_community_tables(OLD_TABLES + NEW_TABLES)
    sql = """SELECT NOT EXISTS(SELECT 1 FROM hash_talk.message_changes)
      AND NOT EXISTS(SELECT 1 FROM hash_talk.group_message_changes)
      AND NOT EXISTS(SELECT 1 FROM hash_talk.groups WHERE message_revision<>0)
      AND NOT EXISTS(SELECT 1 FROM hash_talk.group_packets WHERE relation IS NOT NULL)
      AND (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgenabled='O'
        AND tgname IN ('track_message_change_content','group_message_change_usage','group_packet_changes','group_media_changes'))=4
      AND (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgenabled='O'
        AND tgname IN ('track_message_change_content','group_message_change_usage')
        AND tgfoid='hash_talk.track_message_usage()'::regprocedure)=2
      AND (SELECT count(*) FROM pg_indexes WHERE schemaname='hash_talk' AND indexname IN
        ('message_changes_pkey','group_message_changes_pkey','group_packet_relation'))=3
      AND (SELECT count(*) FROM pg_class WHERE relnamespace='hash_talk'::regnamespace
        AND relname IN ('message_changes','group_message_changes')
        AND reloptions @> ARRAY['autovacuum_vacuum_scale_factor=0.05','autovacuum_vacuum_threshold=20',
          'autovacuum_analyze_scale_factor=0.05','autovacuum_analyze_threshold=20'])=2"""
    if backups.pg(['psql', '--no-psqlrc', '--set=ON_ERROR_STOP=1', '--tuples-only', '--no-align', '-c', sql]).strip() != b't':
        raise RuntimeError('Message migration defaults, empty journals, triggers, indexes or maintenance differ.')


def activate(config, work, candidate, before_state):
    background.verify_current(config)
    return base.activate_database(config, work, candidate, {
        'before_state': before_state, 'review': review, 'snapshot': snapshot,
        'versions': 64, 'verify': verify_migration,
        'stop_existing': background.stop, 'resume_existing': background.start, 'start': background.start,
    })
