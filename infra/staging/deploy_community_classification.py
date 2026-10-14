"""Exact 066→067 classification/publication transition through deploy.py only."""
import re
import deploy_remote as base
import deploy_blocks45 as backups
import deploy_background as background
import deploy_message_changes as messages

BEFORE = '64c37f325f5bba54388e7e6257b6f407b19ad3d1'
# The owner requested this feature and VPS activation on 14/10/2026. Keep the
# additive metadata transition closed until exact application sources are reviewed.
REVIEWED = 'bd9ac1ae5749e4571d5ce0602d640db118beaf58'
OLD_TABLES = messages.OLD_TABLES + messages.NEW_TABLES
NEW_TABLES = ('community_classifications',)


def review(candidate, live):
    if not re.fullmatch(r'[a-f0-9]{40}', REVIEWED):
        raise RuntimeError('Community classification migration requires an exact source review and approval.')
    base.reviewed_database(candidate, live, {
        'before': BEFORE, 'reviewed': REVIEWED, 'versions': 67, 'previous_versions': 66,
    })
    base.verify_community_tables(OLD_TABLES)
    for unit in [base.UNIT, *background.UNITS]:
        if base.digest(candidate / 'infra/staging' / unit) != base.digest(live / 'infra/staging' / unit):
            raise RuntimeError('Classification migration does not authorize service unit changes.')
    sql = """SELECT to_regclass('hash_talk.community_classifications') IS NULL
      AND NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='hash_talk'
        AND table_name='public_moderation' AND column_name='publication_mode')"""
    if backups.pg(['psql', '--no-psqlrc', '--set=ON_ERROR_STOP=1', '--tuples-only', '--no-align', '-c', sql]).strip() != b't':
        raise RuntimeError('Classification schema already exists; migration refused.')


def snapshot():
    return backups.database_snapshot(OLD_TABLES,
        omit_columns={'public_moderation': ('publication_mode',)}, version_limit=67)


def verify_migration(candidate, before):
    after, versions = snapshot(), base.attachment_versions(candidate)
    if (before['versions'] != versions[:66] or after['versions'] != versions
            or after['tables'] != before['tables']):
        raise RuntimeError('Classification migration changed existing rows, ledger or checksums.')
    base.verify_community_tables(OLD_TABLES + NEW_TABLES)
    sql = """SELECT NOT EXISTS(SELECT 1 FROM hash_talk.community_classifications)
      AND NOT EXISTS(SELECT 1 FROM hash_talk.public_moderation WHERE publication_mode<>'analysis')
      AND (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgenabled='O'
        AND tgrelid='hash_talk.community_classifications'::regclass
        AND tgname IN ('community_classification_usage','community_classification_fixed'))=2
      AND EXISTS(SELECT 1 FROM pg_indexes WHERE schemaname='hash_talk'
        AND indexname='community_classification_topics' AND indexdef LIKE '%USING gin%')
      AND (SELECT count(*) FROM pg_constraint WHERE conrelid='hash_talk.public_moderation'::regclass
        AND convalidated AND conname IN ('public_moderation_review_evidence','public_moderation_unreviewed_evidence'))=2
      AND EXISTS(SELECT 1 FROM pg_class WHERE relnamespace='hash_talk'::regnamespace
        AND relname='community_classifications'
        AND reloptions @> ARRAY['autovacuum_vacuum_scale_factor=0.05','autovacuum_vacuum_threshold=20',
          'autovacuum_analyze_scale_factor=0.05','autovacuum_analyze_threshold=20'])"""
    if backups.pg(['psql', '--no-psqlrc', '--set=ON_ERROR_STOP=1', '--tuples-only', '--no-align', '-c', sql]).strip() != b't':
        raise RuntimeError('Classification defaults, empty table, constraints, triggers, index or maintenance differ.')


def activate(config, work, candidate, before_state):
    background.verify_current(config)
    return base.activate_database(config, work, candidate, {
        'before_state': before_state, 'review': review, 'snapshot': snapshot,
        'versions': 66, 'verify': verify_migration,
        'stop_existing': background.stop, 'resume_existing': background.start, 'start': background.start,
    })
