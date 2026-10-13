"""Exact 062→064 mention transition, through the existing deployment executor."""
import re
import deploy_remote as base
import deploy_blocks45 as backups
import deploy_background as background
import deploy_discussion as discussion

BEFORE = '8ffcbc30f3c8b52f5dc729089362ac6511abfe72'
REVIEWED = '375fca2480334d7790d3a8aef8c04050b5d88ccf'
OLD_TABLES = discussion.OLD_TABLES + discussion.NEW_TABLES
NEW_TABLES = ('public_mention_notifications',)


def review(candidate, live):
    if not re.fullmatch(r'[a-f0-9]{40}', REVIEWED):
        raise RuntimeError('Mention migration requires an exact source review.')
    base.reviewed_database(candidate, live, {
        'before': BEFORE, 'reviewed': REVIEWED, 'versions': 64, 'previous_versions': 62,
    })
    base.verify_community_tables(OLD_TABLES)
    for unit in [base.UNIT, *background.UNITS]:
        if base.digest(candidate / 'infra/staging' / unit) != base.digest(live / 'infra/staging' / unit):
            raise RuntimeError('Mention migration does not authorize service unit changes.')
    sql = """SELECT EXISTS(SELECT 1 FROM pg_collation WHERE collname='und-x-icu')
      AND NOT EXISTS(SELECT 1 FROM hash_talk.communities
        GROUP BY replace(lower(trim(regexp_replace(normalize(name,NFKC) COLLATE pg_catalog."und-x-icu",'\\s+',' ','g'))),'ς','σ')
        HAVING count(*)>1)"""
    if backups.pg(['psql', '--no-psqlrc', '--set=ON_ERROR_STOP=1', '--tuples-only', '--no-align', '-c', sql]).strip() != b't':
        raise RuntimeError('Unique community names or installed ICU collation require review.')


def snapshot():
    # The transition changes constraints and adds an empty reference table only.
    # Compare every existing row, including the capacity ledger, without omissions.
    return backups.database_snapshot(OLD_TABLES)


def verify_migration(candidate, before):
    after, versions = snapshot(), base.attachment_versions(candidate)
    if (before['versions'] != versions[:62] or after['versions'] != versions
            or after['tables'] != before['tables']):
        raise RuntimeError('Mention migration changed existing rows, ledger or checksums.')
    base.verify_community_tables(OLD_TABLES + NEW_TABLES)
    sql = """SELECT NOT EXISTS(SELECT 1 FROM hash_talk.public_mention_notifications)
      AND (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgenabled='O'
        AND tgname='mention_notification_usage'
        AND tgfoid='hash_talk.track_message_usage()'::regprocedure)=1
      AND (SELECT count(*) FROM pg_indexes WHERE schemaname='hash_talk' AND indexname IN (
        'community_unique_name','mention_notification_post','mention_notification_profile',
        'mention_notification_community','mention_notification_inbox','mention_notification_post_source',
        'mention_notification_profile_source','mention_notification_community_source'))=8
      AND hash_talk.community_name_key('  DOTA   Brasil  ')=hash_talk.community_name_key('dota brasil')
      AND (SELECT count(*) FROM pg_constraint WHERE connamespace='hash_talk'::regnamespace AND (
        (conname='community_posts_title_check' AND pg_get_constraintdef(oid) LIKE '%10000%') OR
        (conname='community_posts_text_check' AND pg_get_constraintdef(oid) LIKE '%16000%') OR
        (conname='communities_description_check' AND pg_get_constraintdef(oid) LIKE '%12000%') OR
        (conname='public_profile_descriptions_description_check' AND pg_get_constraintdef(oid) LIKE '%10000%')))=4"""
    if backups.pg(['psql', '--no-psqlrc', '--set=ON_ERROR_STOP=1', '--tuples-only', '--no-align', '-c', sql]).strip() != b't':
        raise RuntimeError('Mention migration constraints, empty table, indexes or accounting differ.')


def activate(config, work, candidate, before_state):
    background.verify_current(config)
    return base.activate_database(config, work, candidate, {
        'before_state': before_state, 'review': review, 'snapshot': snapshot,
        'versions': 62, 'verify': verify_migration,
        'stop_existing': background.stop, 'resume_existing': background.start, 'start': background.start,
    })
