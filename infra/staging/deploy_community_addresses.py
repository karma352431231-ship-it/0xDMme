"""Owner-approved 071→072 public addresses, through the existing deploy.py only."""
import re
import deploy_remote as base
import deploy_blocks45 as backups
import deploy_background as background
import deploy_chat_attachments as chat

# Owner explicitly approved the new migration after its explanation on 16/10/2026.
BEFORE = '21fc70c0d508230fa26146be32ad8faa67890812'
REVIEWED = 'cf957aab8304dc5503300aeadffb631dfc97e40c'
OLD_TABLES = chat.OLD_TABLES
NEW_TABLES = ('community_addresses',)

ABSENT = "SELECT to_regclass('hash_talk.community_addresses') IS NULL"
SCHEMA_CHECK = """SELECT NOT EXISTS(SELECT 1 FROM hash_talk.community_addresses)
  AND (SELECT count(*)=1 FROM pg_trigger WHERE NOT tgisinternal AND tgenabled='O'
    AND tgrelid='hash_talk.community_addresses'::regclass AND tgname='community_address_usage'
    AND tgfoid='hash_talk.track_message_usage()'::regprocedure)
  AND (SELECT count(*)=1 FROM pg_constraint WHERE conrelid='hash_talk.community_addresses'::regclass
    AND contype='u' AND convalidated)
  AND (SELECT count(*)=1 FROM pg_constraint WHERE conrelid='hash_talk.community_addresses'::regclass
    AND contype='f' AND convalidated AND confrelid='hash_talk.communities'::regclass AND confdeltype='c')
  AND EXISTS(SELECT 1 FROM pg_class WHERE oid='hash_talk.community_addresses'::regclass
    AND reloptions @> ARRAY['autovacuum_vacuum_scale_factor=0.05','autovacuum_vacuum_threshold=20',
      'autovacuum_analyze_scale_factor=0.05','autovacuum_analyze_threshold=20'])"""


def psql(sql):
    return backups.pg(['psql', '--no-psqlrc', '--set=ON_ERROR_STOP=1', '--tuples-only', '--no-align', '-c', sql]).strip()


def review(candidate, live):
    if not re.fullmatch(r'[a-f0-9]{40}', REVIEWED):
        raise RuntimeError('Community addresses require exact source review and approval.')
    base.reviewed_database(candidate, live, {
        'before': BEFORE, 'reviewed': REVIEWED, 'versions': 72, 'previous_versions': 71,
    })
    base.verify_community_tables(OLD_TABLES)
    for unit in [base.UNIT, *background.UNITS]:
        if base.digest(candidate / 'infra/staging' / unit) != base.digest(live / 'infra/staging' / unit):
            raise RuntimeError('Community addresses do not authorize service unit changes.')
    if psql(ABSENT) != b't':
        raise RuntimeError('Community address table already exists; migration refused.')


def snapshot():
    return backups.database_snapshot(OLD_TABLES, version_limit=72)


def verify_migration(candidate, before):
    after, versions = snapshot(), base.attachment_versions(candidate)
    if before['versions'] != versions[:71] or after['versions'] != versions:
        raise RuntimeError('Community address migration sequence or checksums differ.')
    if after['tables'] != before['tables']:
        raise RuntimeError('Community addresses changed existing rows or ledger.')
    base.verify_community_tables(OLD_TABLES + NEW_TABLES)
    if psql(SCHEMA_CHECK) != b't':
        raise RuntimeError('Community address empty table, uniqueness, FK, trigger or maintenance differ.')


def activate(config, work, candidate, before_state):
    background.verify_current(config)
    return base.activate_database(config, work, candidate, {
        'before_state': before_state, 'review': review, 'snapshot': snapshot,
        'versions': 71, 'verify': verify_migration,
        'stop_existing': background.stop, 'resume_existing': background.start, 'start': background.start,
    })
