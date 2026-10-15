"""Exact owner-approved 068→069 reaction index, through deploy.py only."""
import re
import deploy_remote as base
import deploy_blocks45 as backups
import deploy_background as background
import deploy_public_upvotes as upvotes

BEFORE = 'c4a164b6becb6ff1544de15589c0b5f3c19421f2'
REVIEWED = 'b3f3dd49915b2af8c09e5a902d996802e7569d1b'
OLD_TABLES = upvotes.OLD_TABLES + upvotes.NEW_TABLES

SCHEMA_CHECK = """SELECT count(*)=1 FROM pg_index i
  JOIN pg_class c ON c.oid=i.indexrelid
  JOIN pg_am a ON a.oid=c.relam
  WHERE c.relnamespace='hash_talk'::regnamespace
    AND c.relname='social_messages_reaction_target'
    AND i.indrelid='hash_talk.social_messages'::regclass AND a.amname='btree'
    AND i.indisvalid AND i.indisready AND i.indislive
    AND NOT i.indisunique AND NOT i.indisprimary
    AND i.indnkeyatts=2 AND i.indnatts=2
    AND pg_get_expr(i.indexprs,i.indrelid)='((body -> ''relation''::text) ->> ''id''::text)'
    AND pg_get_indexdef(i.indexrelid,2,true)='sender'
    AND pg_get_expr(i.indpred,i.indrelid)='((body -> ''relation''::text) IS NOT NULL)'"""


def review(candidate, live):
    if not re.fullmatch(r'[a-f0-9]{40}', REVIEWED):
        raise RuntimeError('Reaction index requires exact source review and approval.')
    base.reviewed_database(candidate, live, {
        'before': BEFORE, 'reviewed': REVIEWED, 'versions': 69, 'previous_versions': 68,
    })
    base.verify_community_tables(OLD_TABLES)
    for unit in [base.UNIT, *background.UNITS]:
        if base.digest(candidate / 'infra/staging' / unit) != base.digest(live / 'infra/staging' / unit):
            raise RuntimeError('Reaction index does not authorize service unit changes.')
    sql = "SELECT to_regclass('hash_talk.social_messages_reaction_target') IS NULL"
    if backups.pg(['psql', '--no-psqlrc', '--set=ON_ERROR_STOP=1', '--tuples-only', '--no-align', '-c', sql]).strip() != b't':
        raise RuntimeError('Reaction index already exists; migration refused.')


def snapshot():
    return backups.database_snapshot(OLD_TABLES, version_limit=69)


def verify_migration(candidate, before):
    after, versions = snapshot(), base.attachment_versions(candidate)
    if (before['versions'] != versions[:68] or after['versions'] != versions
            or after['tables'] != before['tables']):
        raise RuntimeError('Reaction index changed existing rows, ledger or checksums.')
    base.verify_community_tables(OLD_TABLES)
    if backups.pg(['psql', '--no-psqlrc', '--set=ON_ERROR_STOP=1', '--tuples-only', '--no-align', '-c', SCHEMA_CHECK]).strip() != b't':
        raise RuntimeError('Reaction index target, keys, predicate or readiness differ.')


def activate(config, work, candidate, before_state):
    background.verify_current(config)
    return base.activate_database(config, work, candidate, {
        'before_state': before_state, 'review': review, 'snapshot': snapshot,
        'versions': 68, 'verify': verify_migration,
        'stop_existing': background.stop, 'resume_existing': background.start, 'start': background.start,
    })
