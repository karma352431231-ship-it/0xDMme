"""Review the exact 049→052 public-profile transition through deploy.py only."""

import re

import deploy_remote as base
import deploy_blocks45 as backups
import deploy_background as background

BEFORE = '8a793e32e2cfaa7cc0b97b1195f30802f389c09d'
# Owner authorized 050–052, backup, own maintenance and publication after CI on
# 10/10/2026. Bind the exact reviewed application sources, including SQL 050.
REVIEWED = '8781914293edae254a855c49222b7136d5e3eba4'
OLD_TABLES = background.OLD_TABLES + background.NEW_TABLES
NEW_TABLES = ('public_profile_follows', 'public_profile_banners')


def review(candidate, live):
    if not re.fullmatch(r'[a-f0-9]{40}', REVIEWED):
        raise RuntimeError('Public-profile database transition requires an exact source review.')
    base.reviewed_database(candidate, live, {
        'before': BEFORE, 'reviewed': REVIEWED,
        'versions': 52, 'previous_versions': 49,
    })
    base.verify_community_tables(OLD_TABLES)
    for unit in background.UNITS:
        if base.digest(candidate / 'infra/staging' / unit) != base.digest(live / 'infra/staging' / unit):
            raise RuntimeError('Public-profile review does not authorize worker unit changes.')


def snapshot():
    # New nullable/defaulted columns are checked separately; all other existing
    # rows, the global usage ledger and migration checksums must stay identical.
    return backups.database_snapshot(OLD_TABLES, omit_columns={
        'public_profiles': ('created_at',),
        'public_moderation': ('publication_phase', 'warned_at'),
    })


def verify_migration(candidate, before):
    after, versions = snapshot(), base.attachment_versions(candidate)
    if (before['versions'] != versions[:49] or after['versions'] != versions
            or after['tables'] != before['tables']):
        raise RuntimeError('Public-profile migration changed existing records or checksums.')
    base.verify_community_tables(OLD_TABLES + NEW_TABLES)
    sql = """SELECT
      NOT EXISTS(SELECT 1 FROM hash_talk.public_profile_follows) AND
      NOT EXISTS(SELECT 1 FROM hash_talk.public_profile_banners) AND
      NOT EXISTS(SELECT 1 FROM hash_talk.public_profiles WHERE created_at IS NOT NULL) AND
      NOT EXISTS(SELECT 1 FROM hash_talk.public_moderation WHERE publication_phase<>'before' OR warned_at IS NOT NULL) AND
      (SELECT column_default='clock_timestamp()' FROM information_schema.columns
        WHERE table_schema='hash_talk' AND table_name='public_profiles' AND column_name='created_at') AND
      to_regclass('hash_talk.public_profile_author_activity') IS NOT NULL AND
      to_regclass('hash_talk.public_profile_followers') IS NOT NULL AND
      to_regclass('hash_talk.public_profile_conversation_replies') IS NOT NULL"""
    if backups.pg(['psql', '--no-psqlrc', '--set=ON_ERROR_STOP=1',
                   '--tuples-only', '--no-align', '-c', sql]).strip() != b't':
        raise RuntimeError('Public-profile initial defaults, empty tables or indexes differ.')


def activate(config, work, candidate, before_state):
    background.verify_current(config)
    return base.activate_database(config, work, candidate, {
        'before_state': before_state, 'review': review, 'snapshot': snapshot,
        'versions': 49, 'verify': verify_migration,
        'stop_existing': background.stop, 'resume_existing': background.start,
        'start': background.start,
    })
