"""Review the exact 053→054 private-group admission transition through deploy.py."""

import re

import deploy_remote as base
import deploy_blocks45 as backups
import deploy_background as background
import deploy_profile_description as descriptions

BEFORE = '4486e3aeb5b3742e6ea173fc954b9cff74f36605'
# Owner authorized integrating the committed branches into main and activating
# private groups on 11/10/2026. These application sources include migration 054;
# subsequent deployment-only changes must not alter that reviewed source tree.
REVIEWED = '99c7de5ec0fcfa14d019c30b6503b67bcf523d20'
OLD_TABLES = descriptions.OLD_TABLES + descriptions.NEW_TABLES
NEW_TABLES = ('group_links',)


def review(candidate, live):
    if not re.fullmatch(r'[a-f0-9]{40}', REVIEWED):
        raise RuntimeError('Group link transition requires an exact source review.')
    base.reviewed_database(candidate, live, {
        'before': BEFORE, 'reviewed': REVIEWED,
        'versions': 54, 'previous_versions': 53,
    })
    base.verify_community_tables(OLD_TABLES)
    for unit in background.UNITS:
        if base.digest(candidate / 'infra/staging' / unit) != base.digest(live / 'infra/staging' / unit):
            raise RuntimeError('Group link review does not authorize worker unit changes.')


def snapshot():
    # 054 only adds the link registry. Preserve every existing row, the global
    # usage ledger and all previously applied migration checksums.
    return backups.database_snapshot(OLD_TABLES)


def verify_migration(candidate, before):
    after, versions = snapshot(), base.attachment_versions(candidate)
    if (before['versions'] != versions[:53] or after['versions'] != versions
            or after['tables'] != before['tables']):
        raise RuntimeError('Group link migration changed existing records or checksums.')
    base.verify_community_tables(OLD_TABLES + NEW_TABLES)
    sql = """SELECT
      NOT EXISTS(SELECT 1 FROM hash_talk.group_links) AND
      EXISTS(SELECT 1 FROM pg_trigger WHERE NOT tgisinternal
        AND tgrelid='hash_talk.group_links'::regclass
        AND tgname='group_link_usage' AND tgenabled='O'
        AND tgfoid='hash_talk.track_message_usage()'::regprocedure)"""
    if backups.pg(['psql', '--no-psqlrc', '--set=ON_ERROR_STOP=1',
                   '--tuples-only', '--no-align', '-c', sql]).strip() != b't':
        raise RuntimeError('Group link table is not empty or lacks its enabled usage trigger.')


def activate(config, work, candidate, before_state):
    background.verify_current(config)
    return base.activate_database(config, work, candidate, {
        'before_state': before_state, 'review': review, 'snapshot': snapshot,
        'versions': 53, 'verify': verify_migration,
        'stop_existing': background.stop, 'resume_existing': background.start,
        'start': background.start,
    })
