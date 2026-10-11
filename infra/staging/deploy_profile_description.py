"""Review the exact 052→053 public-profile description transition through deploy.py only."""

import re

import deploy_remote as base
import deploy_blocks45 as backups
import deploy_background as background
import deploy_profile_social as social

BEFORE = '000308884e86989fb3dbd9326deb2f6608ef5511'
# Owner authorized migration 053 and its publication after CI on 10/10/2026,
# joined with the published pose moderation (0003088) in one release branch.
# Bind the exact reviewed application sources of that merge.
REVIEWED = '6a4d8e0702dbadeee596a2131f802a5190ec8e9d'
OLD_TABLES = social.OLD_TABLES + social.NEW_TABLES
NEW_TABLES = ('public_profile_descriptions',)


def review(candidate, live):
    if not re.fullmatch(r'[a-f0-9]{40}', REVIEWED):
        raise RuntimeError('Profile description transition requires an exact source review.')
    base.reviewed_database(candidate, live, {
        'before': BEFORE, 'reviewed': REVIEWED,
        'versions': 53, 'previous_versions': 52,
    })
    base.verify_community_tables(OLD_TABLES)
    for unit in background.UNITS:
        if base.digest(candidate / 'infra/staging' / unit) != base.digest(live / 'infra/staging' / unit):
            raise RuntimeError('Profile description review does not authorize worker unit changes.')


def snapshot():
    # 053 only adds a table: every existing row, the global usage ledger and
    # the migration checksums must stay identical.
    return backups.database_snapshot(OLD_TABLES)


def verify_migration(candidate, before):
    after, versions = snapshot(), base.attachment_versions(candidate)
    if (before['versions'] != versions[:52] or after['versions'] != versions
            or after['tables'] != before['tables']):
        raise RuntimeError('Profile description migration changed existing records or checksums.')
    base.verify_community_tables(OLD_TABLES + NEW_TABLES)
    sql = """SELECT
      NOT EXISTS(SELECT 1 FROM hash_talk.public_profile_descriptions) AND
      EXISTS(SELECT 1 FROM pg_trigger WHERE NOT tgisinternal
        AND tgrelid='hash_talk.public_profile_descriptions'::regclass
        AND tgname='public_profile_description_usage')"""
    if backups.pg(['psql', '--no-psqlrc', '--set=ON_ERROR_STOP=1',
                   '--tuples-only', '--no-align', '-c', sql]).strip() != b't':
        raise RuntimeError('Profile description table is not empty or lacks its usage trigger.')


def activate(config, work, candidate, before_state):
    background.verify_current(config)
    return base.activate_database(config, work, candidate, {
        'before_state': before_state, 'review': review, 'snapshot': snapshot,
        'versions': 52, 'verify': verify_migration,
        'stop_existing': background.stop, 'resume_existing': background.start,
        'start': background.start,
    })
