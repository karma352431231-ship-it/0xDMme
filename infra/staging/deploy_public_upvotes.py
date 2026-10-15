"""Exact owner-approved 067→068 transition, through deploy.py only."""
import re
import deploy_remote as base
import deploy_blocks45 as backups
import deploy_background as background
import deploy_community_classification as classification

BEFORE = 'cfecfc9b2b37ba57ffc8875bcedd7bfeaabc5caf'
REVIEWED = '84a9cbe9b24a43d08f14d215d16ff0f5100c09c7'
OLD_TABLES = classification.OLD_TABLES + classification.NEW_TABLES
NEW_TABLES = ('public_upvote_notifications',)

SCHEMA_CHECK = """SELECT NOT EXISTS(SELECT 1 FROM hash_talk.public_upvote_notifications)
  AND (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgenabled='O'
    AND tgrelid='hash_talk.public_upvote_notifications'::regclass
    AND tgname='public_upvote_notification_usage'
    AND tgfoid='hash_talk.track_message_usage()'::regprocedure
    AND pg_get_triggerdef(oid) LIKE '%AFTER INSERT OR DELETE OR UPDATE%')=1
  AND (SELECT count(*) FROM pg_constraint WHERE conrelid='hash_talk.public_upvote_notifications'::regclass AND convalidated)=6
  AND EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='hash_talk.public_upvote_notifications'::regclass
    AND contype='f' AND confrelid='hash_talk.community_votes'::regclass AND confdeltype='c'
    AND pg_get_constraintdef(oid) LIKE 'FOREIGN KEY (actor, post_id) REFERENCES hash_talk.community_votes(profile_id, post_id)%')
  AND EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='hash_talk.public_upvote_notifications'::regclass
    AND contype='f' AND confrelid='hash_talk.public_profiles'::regclass AND confdeltype='c')
  AND EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='hash_talk.public_upvote_notifications'::regclass
    AND contype='u' AND pg_get_constraintdef(oid)='UNIQUE (actor, post_id)')
  AND EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='hash_talk.public_upvote_notifications'::regclass
    AND contype='p' AND pg_get_constraintdef(oid)='PRIMARY KEY (id)')
  AND EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='hash_talk.public_upvote_notifications'::regclass
    AND contype='c' AND pg_get_constraintdef(oid) LIKE '%charge = 384%')
  AND EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='hash_talk.public_upvote_notifications'::regclass
    AND contype='c' AND pg_get_constraintdef(oid) LIKE '%recipient <> actor%')
  AND (SELECT count(*) FROM information_schema.columns WHERE table_schema='hash_talk'
    AND table_name='public_upvote_notifications' AND is_nullable='NO')=7
  AND (SELECT count(*) FROM information_schema.columns WHERE table_schema='hash_talk'
    AND table_name='public_upvote_notifications' AND
      ((column_name='id' AND column_default='gen_random_uuid()') OR
       (column_name='created_at' AND column_default='clock_timestamp()' AND datetime_precision=3) OR
       (column_name='read' AND column_default='false') OR
       (column_name='charge' AND column_default='384')))=4
  AND EXISTS(SELECT 1 FROM pg_indexes WHERE schemaname='hash_talk'
    AND indexname='public_upvote_notification_page'
    AND indexdef LIKE '%(recipient, created_at DESC, id DESC)%')
  AND EXISTS(SELECT 1 FROM pg_indexes WHERE schemaname='hash_talk'
    AND indexname='public_upvote_voters' AND indexdef LIKE '%(post_id, profile_id DESC)%'
    AND replace(indexdef,'"','') LIKE '%WHERE (position = 1)%')
  AND EXISTS(SELECT 1 FROM pg_class WHERE relnamespace='hash_talk'::regnamespace
    AND relname='public_upvote_notifications'
    AND reloptions @> ARRAY['autovacuum_vacuum_scale_factor=0.05','autovacuum_vacuum_threshold=20',
      'autovacuum_analyze_scale_factor=0.05','autovacuum_analyze_threshold=20'])"""


def review(candidate, live):
    if not re.fullmatch(r'[a-f0-9]{40}', REVIEWED):
        raise RuntimeError('Public upvote migration requires exact source review and approval.')
    base.reviewed_database(candidate, live, {
        'before': BEFORE, 'reviewed': REVIEWED, 'versions': 68, 'previous_versions': 67,
    })
    base.verify_community_tables(OLD_TABLES)
    for unit in [base.UNIT, *background.UNITS]:
        if base.digest(candidate / 'infra/staging' / unit) != base.digest(live / 'infra/staging' / unit):
            raise RuntimeError('Public upvote migration does not authorize service unit changes.')
    sql = """SELECT to_regclass('hash_talk.public_upvote_notifications') IS NULL
      AND to_regclass('hash_talk.public_upvote_notification_page') IS NULL
      AND to_regclass('hash_talk.public_upvote_voters') IS NULL"""
    if backups.pg(['psql', '--no-psqlrc', '--set=ON_ERROR_STOP=1', '--tuples-only', '--no-align', '-c', sql]).strip() != b't':
        raise RuntimeError('Public upvote schema already exists; migration refused.')


def snapshot():
    return backups.database_snapshot(OLD_TABLES, version_limit=68)


def verify_migration(candidate, before):
    after, versions = snapshot(), base.attachment_versions(candidate)
    if (before['versions'] != versions[:67] or after['versions'] != versions
            or after['tables'] != before['tables']):
        raise RuntimeError('Public upvote migration changed existing rows, ledger or checksums.')
    base.verify_community_tables(OLD_TABLES + NEW_TABLES)
    if backups.pg(['psql', '--no-psqlrc', '--set=ON_ERROR_STOP=1', '--tuples-only', '--no-align', '-c', SCHEMA_CHECK]).strip() != b't':
        raise RuntimeError('Public upvote empty table, constraints, defaults, trigger, indexes or maintenance differ.')


def activate(config, work, candidate, before_state):
    background.verify_current(config)
    return base.activate_database(config, work, candidate, {
        'before_state': before_state, 'review': review, 'snapshot': snapshot,
        'versions': 67, 'verify': verify_migration,
        'stop_existing': background.stop, 'resume_existing': background.start, 'start': background.start,
    })
