"""Exact owner-approved 069→070 ranking activity transition, through deploy.py only."""
import re
import deploy_remote as base
import deploy_blocks45 as backups
import deploy_background as background
import deploy_social_reactions as reactions

# Owner approved on 16/10/2026: voters count as active members and ranking
# entries keep the previous window. Live predecessor and reviewed sources.
BEFORE = 'ae7bd3023e5872d733909a11d2cb6f1251e77ed0'
REVIEWED = '29d2804ebe48f63829b9e4069013f93d41ff3d18'
OLD_TABLES = reactions.OLD_TABLES
# Two added columns; every other value of every existing row must not change.
OMIT_COLUMNS = {
    'community_votes': ('voted_at',),
    'community_ranking_entries': ('previous_participants',),
}

ABSENT = """SELECT NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='hash_talk'
    AND ((table_name='community_votes' AND column_name='voted_at') OR
         (table_name='community_ranking_entries' AND column_name='previous_participants')))
  AND to_regclass('hash_talk.community_votes_recent') IS NULL"""

SCHEMA_CHECK = """SELECT (SELECT data_type='timestamp with time zone' AND datetime_precision=3 AND is_nullable='YES'
      AND column_default IS NULL FROM information_schema.columns WHERE table_schema='hash_talk'
      AND table_name='community_votes' AND column_name='voted_at')
  AND (SELECT data_type='integer' AND is_nullable='NO' AND column_default='0'
      FROM information_schema.columns WHERE table_schema='hash_talk'
      AND table_name='community_ranking_entries' AND column_name='previous_participants')
  AND NOT EXISTS(SELECT 1 FROM hash_talk.community_votes WHERE voted_at IS NOT NULL)
  AND NOT EXISTS(SELECT 1 FROM hash_talk.community_ranking_entries WHERE previous_participants<>0)
  AND (SELECT count(*)=1 FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid
      WHERE c.relnamespace='hash_talk'::regnamespace AND c.relname='community_votes_recent'
      AND i.indrelid='hash_talk.community_votes'::regclass AND i.indisvalid AND i.indisready
      AND NOT i.indisunique AND i.indnatts=1
      AND pg_get_expr(i.indpred,i.indrelid)='((voted_at IS NOT NULL) AND ("position" <> 0))')"""


def psql(sql):
    return backups.pg(['psql', '--no-psqlrc', '--set=ON_ERROR_STOP=1', '--tuples-only', '--no-align', '-c', sql]).strip()


def review(candidate, live):
    if not re.fullmatch(r'[a-f0-9]{40}', REVIEWED):
        raise RuntimeError('Ranking activity requires exact source review and approval.')
    base.reviewed_database(candidate, live, {
        'before': BEFORE, 'reviewed': REVIEWED, 'versions': 70, 'previous_versions': 69,
    })
    base.verify_community_tables(OLD_TABLES)
    for unit in [base.UNIT, *background.UNITS]:
        if base.digest(candidate / 'infra/staging' / unit) != base.digest(live / 'infra/staging' / unit):
            raise RuntimeError('Ranking activity does not authorize service unit changes.')
    if psql(ABSENT) != b't':
        raise RuntimeError('Ranking activity columns or index already exist; migration refused.')


def snapshot():
    return backups.database_snapshot(OLD_TABLES, omit_columns=OMIT_COLUMNS, version_limit=70)


def verify_migration(candidate, before):
    after, versions = snapshot(), base.attachment_versions(candidate)
    if before['versions'] != versions[:69] or after['versions'] != versions:
        raise RuntimeError('Ranking activity migration sequence or checksums differ.')
    if after['tables'] != before['tables']:
        raise RuntimeError('Ranking activity changed existing rows or ledger.')
    base.verify_community_tables(OLD_TABLES)
    if psql(SCHEMA_CHECK) != b't':
        raise RuntimeError('Ranking activity columns, defaults, empty values or index differ.')


def activate(config, work, candidate, before_state):
    background.verify_current(config)
    return base.activate_database(config, work, candidate, {
        'before_state': before_state, 'review': review, 'snapshot': snapshot,
        'versions': 69, 'verify': verify_migration,
        'stop_existing': background.stop, 'resume_existing': background.start, 'start': background.start,
    })
