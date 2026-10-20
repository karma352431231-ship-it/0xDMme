"""Exact 092→093 directory transition, through the existing deployment executor."""
import deploy_remote as base
import deploy_blocks45 as backups
import deploy_background as background
import deploy_account_rankings as ranking

BEFORE = '1d4689916e0f7ec653667de28c2b708a2150b2c6'
REVIEWED = '3c19bcdeb5bc8384aab1d51d8696d8b5351ebac0'
TABLES = ranking.TABLES + ranking.NEW_TABLES
OMIT_COLUMNS = {'profile_ranking_entries': ('followers',),
                'community_ranking_generations': ('expires_at',)}
ABSENT = """SELECT NOT EXISTS(SELECT 1 FROM information_schema.columns
 WHERE table_schema='hash_talk' AND table_name='profile_ranking_entries' AND column_name='followers')
 AND to_regclass('hash_talk.profile_ranking_size') IS NULL
 AND NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname IN ('profile_directory_created','profile_directory_followed')
 AND tgrelid IN ('hash_talk.public_profiles'::regclass,'hash_talk.public_profile_follows'::regclass))"""
SCHEMA_CHECK = """SELECT
 (SELECT count(*)=1 FROM information_schema.columns WHERE table_schema='hash_talk'
 AND table_name='profile_ranking_entries' AND column_name='followers' AND data_type='bigint'
 AND is_nullable='NO' AND column_default='0')
 AND EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='hash_talk.profile_ranking_entries'::regclass
 AND contype='c' AND convalidated AND pg_get_constraintdef(oid) LIKE '%followers >= 0%')
 AND (SELECT indisvalid AND indisready AND pg_get_indexdef(indexrelid)
 LIKE '%(generation, period, followers DESC, profile_id DESC)%' FROM pg_index
 WHERE indexrelid=to_regclass('hash_talk.profile_ranking_size'))
 AND (SELECT count(*)=2 FROM pg_trigger WHERE NOT tgisinternal AND tgenabled='O'
 AND tgfoid='hash_talk.mark_profile_directory()'::regprocedure
 AND tgname IN ('profile_directory_created','profile_directory_followed'))
 AND NOT EXISTS(SELECT 1 FROM hash_talk.profile_ranking_entries WHERE followers<>0)
 AND NOT EXISTS(SELECT 1 FROM hash_talk.community_ranking_generations WHERE expires_at>clock_timestamp())"""


def review(candidate, live):
    base.reviewed_database(candidate, live, {'before': BEFORE, 'reviewed': REVIEWED,
        'versions': 93, 'previous_versions': 92})
    base.verify_community_tables(TABLES)
    for unit in [base.UNIT, *background.UNITS]:
        name = 'infra/staging/' + unit
        if base.digest(candidate / name) != base.digest(live / name):
            raise RuntimeError('Profile directory does not authorize unit changes.')
    if ranking.capacity.psql(ABSENT) != b't':
        raise RuntimeError('Profile directory predecessor schema differs.')


def snapshot():
    small = tuple(name for name in TABLES if name not in ranking.batches.KEYS)
    result = backups.database_snapshot(small, omit_columns=OMIT_COLUMNS,
        version_limit=93, include_reserved=True)
    result['tables'].update(ranking.batches.snapshot(backups.node, backups.URL_CHECK))
    return result


def verify_migration(candidate, before):
    after, versions = snapshot(), base.attachment_versions(candidate)
    if (before['versions'] != versions[:92] or after['versions'] != versions
            or before['tables'] != after['tables']):
        raise RuntimeError('Profile directory changed existing data, accounting or applied history.')
    base.verify_community_tables(TABLES)
    if any(ranking.capacity.psql(sql) != b't' for sql in
           [SCHEMA_CHECK, ranking.COUNTER_CHECKS, ranking.GLOBAL_CHECK]):
        raise RuntimeError('Profile directory schema or capacity reconciliation failed.')


def activate(config, work, candidate, before_state):
    if config.get('profile_directory') is not True:
        raise RuntimeError('Profile directory migration requires explicit --profile-directory approval.')
    background.verify_current(config)
    ranking.parts.require_workers()
    result = base.activate_database(config, work, candidate, {
        'before_state': before_state, 'review': review, 'snapshot': snapshot,
        'versions': 92, 'verify': verify_migration,
        'stop_existing': background.stop, 'resume_existing': background.start,
        'start': background.start,
    })
    result['profile_directory_schema_versions'] = 93
    base.receipt(work, result)
    return result
