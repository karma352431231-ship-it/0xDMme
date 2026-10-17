"""Exact owner-approved 070→071 chat attachment limit transition, through deploy.py only."""
import re
import deploy_remote as base
import deploy_blocks45 as backups
import deploy_background as background
import deploy_ranking_activity as ranking

# Owner approved on 16/10/2026: private and group chat attachments up to 10 MB.
# Live predecessor and reviewed sources.
BEFORE = '78138f4df621807596cb88ca795a36c32a9598a9'
REVIEWED = '49befd3e791e704bec116223459a40c0be2a288b'
OLD_TABLES = ranking.OLD_TABLES

CHECKS = """SELECT string_agg(conname||'='||pg_get_constraintdef(oid)||'/'||convalidated::text, ';' ORDER BY conname)
  FROM pg_constraint WHERE conname IN ('message_attachments_bytes_check','group_media_bytes_check')
  AND connamespace='hash_talk'::regnamespace"""
BEFORE_CHECKS = ('group_media_bytes_check=CHECK (((bytes >= 1) AND (bytes <= 3000000)))/true;'
                 'message_attachments_bytes_check=CHECK (((bytes >= 1) AND (bytes <= 3000000)))/true')
AFTER_CHECKS = BEFORE_CHECKS.replace('3000000', '10000000')


def psql(sql):
    return backups.pg(['psql', '--no-psqlrc', '--set=ON_ERROR_STOP=1', '--tuples-only', '--no-align', '-c', sql]).strip()


def review(candidate, live):
    if not re.fullmatch(r'[a-f0-9]{40}', REVIEWED):
        raise RuntimeError('Chat attachment limit requires exact source review and approval.')
    base.reviewed_database(candidate, live, {
        'before': BEFORE, 'reviewed': REVIEWED, 'versions': 71, 'previous_versions': 70,
    })
    base.verify_community_tables(OLD_TABLES)
    for unit in [base.UNIT, *background.UNITS]:
        if base.digest(candidate / 'infra/staging' / unit) != base.digest(live / 'infra/staging' / unit):
            raise RuntimeError('Chat attachment limit does not authorize service unit changes.')
    if psql(CHECKS) != BEFORE_CHECKS.encode():
        raise RuntimeError('Chat attachment checks differ from the reviewed 3 MB state; migration refused.')


def snapshot():
    return backups.database_snapshot(OLD_TABLES, version_limit=71)


def verify_migration(candidate, before):
    after, versions = snapshot(), base.attachment_versions(candidate)
    if before['versions'] != versions[:70] or after['versions'] != versions:
        raise RuntimeError('Chat attachment migration sequence or checksums differ.')
    if after['tables'] != before['tables']:
        raise RuntimeError('Chat attachment limit changed existing rows or ledger.')
    base.verify_community_tables(OLD_TABLES)
    if psql(CHECKS) != AFTER_CHECKS.encode():
        raise RuntimeError('Chat attachment checks are not the validated 10 MB bounds.')


def activate(config, work, candidate, before_state):
    background.verify_current(config)
    return base.activate_database(config, work, candidate, {
        'before_state': before_state, 'review': review, 'snapshot': snapshot,
        'versions': 70, 'verify': verify_migration,
        'stop_existing': background.stop, 'resume_existing': background.start, 'start': background.start,
    })
