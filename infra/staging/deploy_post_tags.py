"""Review the exact 054→055 community post tags transition through deploy.py only."""

import re

import deploy_remote as base
import deploy_blocks45 as backups
import deploy_background as background
import deploy_group_links as groups

# The predecessor is the integrated main with migration 054 (private group links).
BEFORE = '9719676d1ae2bb6a8ed6c8c11fe06b05706e0dbd'
# Owner chose several tags per post, required title and tag, on 11/10/2026.
# Bind the exact reviewed application sources.
REVIEWED = '91cc993a6ae24a443f5d61247e0e1caada3f95e9'
OLD_TABLES = groups.OLD_TABLES + groups.NEW_TABLES
NEW_TABLES = ('community_post_extra_tags',)


def review(candidate, live):
    if not re.fullmatch(r'[a-f0-9]{40}', REVIEWED):
        raise RuntimeError('Post tags transition requires an exact source review.')
    base.reviewed_database(candidate, live, {
        'before': BEFORE, 'reviewed': REVIEWED,
        'versions': 55, 'previous_versions': 54,
    })
    base.verify_community_tables(OLD_TABLES)
    for unit in background.UNITS:
        if base.digest(candidate / 'infra/staging' / unit) != base.digest(live / 'infra/staging' / unit):
            raise RuntimeError('Post tags review does not authorize worker unit changes.')


def snapshot():
    # 055 adds an empty table and loosens a check: every existing row, the
    # global usage ledger and the migration checksums must stay identical.
    return backups.database_snapshot(OLD_TABLES)


def verify_migration(candidate, before):
    after, versions = snapshot(), base.attachment_versions(candidate)
    if (before['versions'] != versions[:54] or after['versions'] != versions
            or after['tables'] != before['tables']):
        raise RuntimeError('Post tags migration changed existing records or checksums.')
    base.verify_community_tables(OLD_TABLES + NEW_TABLES)
    sql = """SELECT
      NOT EXISTS(SELECT 1 FROM hash_talk.community_post_extra_tags) AND
      EXISTS(SELECT 1 FROM pg_trigger WHERE NOT tgisinternal
        AND tgrelid='hash_talk.community_post_extra_tags'::regclass
        AND tgname='community_post_extra_tag_usage') AND
      to_regclass('hash_talk.community_post_extra_tag_filter') IS NOT NULL AND
      (SELECT pg_get_constraintdef(oid) LIKE '%length(title) > 0%' FROM pg_constraint
        WHERE conrelid='hash_talk.community_posts'::regclass AND conname='community_post_content')"""
    if backups.pg(['psql', '--no-psqlrc', '--set=ON_ERROR_STOP=1',
                   '--tuples-only', '--no-align', '-c', sql]).strip() != b't':
        raise RuntimeError('Post tags table, trigger, index or content rule differs.')


def activate(config, work, candidate, before_state):
    background.verify_current(config)
    return base.activate_database(config, work, candidate, {
        'before_state': before_state, 'review': review, 'snapshot': snapshot,
        'versions': 54, 'verify': verify_migration,
        'stop_existing': background.stop, 'resume_existing': background.start,
        'start': background.start,
    })
