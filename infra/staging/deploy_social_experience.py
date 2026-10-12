"""Exact 058→061 social experience transition, invoked only through deploy.py."""

import re

import deploy_remote as base
import deploy_blocks45 as backups
import deploy_background as background
import deploy_social_controls as social

BEFORE = '0065abea363920a0ef414f921f56dcd4f281c569'
# Pin only after source review; activation still requires the owner's migration approval.
REVIEWED = '612a6f4c2fc7822cbc0296564563baff1da53ad4'
OLD_TABLES = social.OLD_TABLES + social.NEW_TABLES
NEW_TABLES = ('community_post_shares',)
OMIT_COLUMNS = {'social_receipts': ('read_epoch',)}


def review(candidate, live):
    if not re.fullmatch(r'[a-f0-9]{40}', REVIEWED):
        raise RuntimeError('Social experience transition requires an exact source review.')
    base.reviewed_database(candidate, live, {
        'before': BEFORE, 'reviewed': REVIEWED,
        'versions': 61, 'previous_versions': 58,
    })
    base.verify_community_tables(OLD_TABLES)
    for unit in [base.UNIT, *background.UNITS]:
        name = 'infra/staging/' + unit
        if base.digest(candidate / name) != base.digest(live / name):
            raise RuntimeError('Social experience review does not authorize service unit changes.')


def snapshot():
    # Only the new nullable column is omitted. Existing receipt fields and all
    # other rows, including content_usage, retain their full checksum contract.
    return backups.database_snapshot(OLD_TABLES, omit_columns=OMIT_COLUMNS)


def verify_migration(candidate, before):
    after, versions = snapshot(), base.attachment_versions(candidate)
    if (before['versions'] != versions[:58] or after['versions'] != versions
            or after['tables'] != before['tables']):
        raise RuntimeError('Social experience migration changed existing records, checksums or ledger.')
    base.verify_community_tables(OLD_TABLES + NEW_TABLES)
    sql = """SELECT
      NOT EXISTS(SELECT 1 FROM hash_talk.community_post_shares) AND
      NOT EXISTS(SELECT 1 FROM hash_talk.social_receipts WHERE read_epoch IS NOT NULL) AND
      (SELECT count(*)=1 FROM pg_trigger WHERE NOT tgisinternal AND tgenabled='O'
        AND tgname='community_share_usage'
        AND tgrelid='hash_talk.community_post_shares'::regclass
        AND tgfoid='hash_talk.track_message_usage()'::regprocedure) AND
      EXISTS(SELECT 1 FROM pg_indexes WHERE schemaname='hash_talk'
        AND tablename='community_post_shares' AND indexname='community_shared_activity'
        AND indexdef LIKE '%(profile_id, created_at DESC, id DESC) WHERE shared') AND
      EXISTS(SELECT 1 FROM pg_indexes WHERE schemaname='hash_talk'
        AND tablename='public_profile_follows' AND indexname='public_profile_notification_targets'
        AND indexdef LIKE '%(target, follower) WHERE (following AND notifications)') AND
      EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='hash_talk'
        AND table_name='social_receipts' AND column_name='read_epoch'
        AND data_type='integer' AND is_nullable='YES' AND column_default IS NULL) AND
      EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='hash_talk.social_receipts'::regclass
        AND contype='c' AND pg_get_constraintdef(oid) LIKE '%read_epoch >= 0%') AND
      EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='hash_talk'
        AND table_name='community_post_shares' AND column_name='charge'
        AND column_default='256') AND
      EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='hash_talk.community_post_shares'::regclass
        AND contype='c' AND pg_get_constraintdef(oid) LIKE '%charge = 256%')"""
    if backups.pg(['psql', '--no-psqlrc', '--set=ON_ERROR_STOP=1',
                   '--tuples-only', '--no-align', '-c', sql]).strip() != b't':
        raise RuntimeError('Social experience migration defaults, indexes, empty shares or historical reads differ.')


def activate(config, work, candidate, before_state):
    background.verify_current(config)
    return base.activate_database(config, work, candidate, {
        'before_state': before_state, 'review': review, 'snapshot': snapshot,
        'versions': 58, 'verify': verify_migration,
        'stop_existing': background.stop, 'resume_existing': background.start,
        'start': background.start,
    })
