"""Exact owner-requested 091→092 rankings, through the existing deploy.py only."""
import re

import deploy_remote as base
import deploy_blocks45 as backups
import deploy_background as background
import deploy_capacity_database as capacity
import deploy_group_media_parts as parts
import deploy_snapshot_batches as batches

BEFORE = 'ecda9eda2dc51000e64e125a623bfea40187d689'
REVIEWED = '72711bad0ef90c1aaa8f5d5f7cc4606973e569ae'
TABLES = capacity.TABLES
NEW_TABLES = ('community_post_engagement', 'community_share_clicks',
              'profile_ranking_state', 'profile_ranking_entries')
OMIT_COLUMNS = {
    'community_ranking_settings': ('engagement_observed_since',),
    'community_ranking_entries': ('views', 'shares', 'comments'),
    # Only the exact seeded state charge may increase this ledger. The separate
    # total below verifies that delta; every partition remains byte-for-byte.
    'content_usage_legacy': ('used_bytes',),
}
ABSENT = """SELECT NOT EXISTS(SELECT 1 FROM information_schema.columns
 WHERE table_schema='hash_talk' AND table_name='community_ranking_settings'
 AND column_name='engagement_observed_since')
 AND to_regclass('hash_talk.community_post_engagement') IS NULL
 AND to_regclass('hash_talk.community_share_clicks') IS NULL
 AND to_regclass('hash_talk.profile_ranking_state') IS NULL
 AND to_regclass('hash_talk.profile_ranking_entries') IS NULL"""
SCHEMA_CHECK = """SELECT
 NOT EXISTS(SELECT 1 FROM hash_talk.community_post_engagement)
 AND NOT EXISTS(SELECT 1 FROM hash_talk.community_share_clicks)
 AND NOT EXISTS(SELECT 1 FROM hash_talk.profile_ranking_entries)
 AND NOT EXISTS(SELECT 1 FROM hash_talk.community_ranking_entries
   WHERE views<>0 OR shares<>0 OR comments<>0)
 AND NOT EXISTS(SELECT 1 FROM hash_talk.profile_ranking_state
   WHERE revision<>1 OR processed<>0 OR metrics IS NOT NULL OR cutoff IS NOT NULL OR charge<>256)
 AND (SELECT count(*)=1 FROM information_schema.columns WHERE table_schema='hash_talk'
   AND table_name='community_ranking_settings' AND column_name='engagement_observed_since'
   AND data_type='timestamp with time zone' AND datetime_precision=3 AND is_nullable='NO'
   AND column_default='clock_timestamp()')
 AND (SELECT count(*)=4 FROM pg_class WHERE relnamespace='hash_talk'::regnamespace
   AND relname IN ('community_post_engagement','community_share_clicks','profile_ranking_state','profile_ranking_entries')
   AND reloptions @> ARRAY['autovacuum_vacuum_scale_factor=0.05','autovacuum_vacuum_threshold=20'])
 AND (SELECT count(*)=6 FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid
   WHERE c.relnamespace='hash_talk'::regnamespace AND i.indisvalid AND i.indisready
   AND c.relname IN ('community_engagement_expiry','community_share_click_expiry','profile_ranking_due',
     'profile_ranking_order','ranking_root_recent_comments','ranking_author_originals'))
 AND (SELECT count(*)=9 FROM pg_constraint WHERE conrelid IN
   ('hash_talk.community_post_engagement'::regclass,'hash_talk.community_share_clicks'::regclass,
    'hash_talk.profile_ranking_state'::regclass,'hash_talk.profile_ranking_entries'::regclass)
   AND contype IN ('p','f') AND convalidated)
 AND (SELECT count(*)=2 FROM pg_constraint WHERE conrelid IN
   ('hash_talk.community_ranking_entries'::regclass,'hash_talk.profile_ranking_entries'::regclass)
   AND contype='c' AND pg_get_constraintdef(oid) LIKE '%month%')
 AND (SELECT count(*)=9 FROM pg_trigger WHERE NOT tgisinternal AND tgenabled='O'
   AND tgname IN ('profile_ranking_post_changed','engagement_ranking_insert','engagement_ranking_update',
     'positive_ranking_changed','view_received','share_received','comment_received',
     'profile_entries_insert_usage','profile_entries_delete_usage'))
 AND NOT EXISTS(SELECT 1 FROM hash_talk.profile_ranking_state s
   WHERE NOT EXISTS(SELECT 1 FROM hash_talk.community_posts p CROSS JOIN hash_talk.community_ranking_settings settings
     WHERE p.author=s.profile_id AND p.parent_id IS NULL AND (
       EXISTS(SELECT 1 FROM hash_talk.community_posts r WHERE r.root_id=p.id
         AND r.created_at>=settings.engagement_observed_since-interval '30 days')
       OR EXISTS(SELECT 1 FROM hash_talk.community_upvote_deltas d WHERE d.post_id=p.id
         AND d.at>=settings.engagement_observed_since-interval '30 days'))))
 AND NOT EXISTS(SELECT 1 FROM hash_talk.community_posts p WHERE p.author IS NOT NULL AND p.parent_id IS NULL
   AND NOT EXISTS(SELECT 1 FROM hash_talk.profile_ranking_state s WHERE s.profile_id=p.author)
   AND (EXISTS(SELECT 1 FROM hash_talk.community_posts r WHERE r.root_id=p.id
     AND r.created_at>=clock_timestamp()-interval '30 days')
     OR EXISTS(SELECT 1 FROM hash_talk.community_upvote_deltas d WHERE d.post_id=p.id
       AND d.at>=clock_timestamp()-interval '30 days')))
 AND (SELECT used_bytes=(SELECT coalesce(sum(charge),0) FROM hash_talk.community_ranking_generations)
   +(SELECT coalesce(sum(charge),0) FROM hash_talk.community_ranking_entries)
   +(SELECT coalesce(sum(charge),0) FROM hash_talk.profile_ranking_entries)
   FROM hash_talk.community_ranking_cache_usage WHERE singleton)"""
COUNTER_CHECKS = parts.COUNTER_CHECKS.replace('tgrelid)=81', 'tgrelid)=84')
GLOBAL_CHECK = capacity.GLOBAL_CHECK.replace('sources<>81', 'sources<>84').replace(
    '  IF sources<>84',
    '  SELECT total+coalesce(sum(charge),0) INTO total FROM hash_talk.profile_ranking_entries;\n  IF sources<>84')


def review(candidate, live):
    if not all(re.fullmatch(r'[a-f0-9]{40}', value) for value in [BEFORE, REVIEWED]):
        raise RuntimeError('Account rankings require exact source review.')
    base.reviewed_database(candidate, live, {'before': BEFORE, 'reviewed': REVIEWED,
        'versions': 92, 'previous_versions': 91})
    base.verify_community_tables(TABLES)
    for unit in [base.UNIT, *background.UNITS]:
        name = 'infra/staging/' + unit
        if base.digest(candidate / name) != base.digest(live / name):
            raise RuntimeError('Account rankings do not authorize unit changes.')
    if capacity.psql(ABSENT) != b't':
        raise RuntimeError('Account ranking tables or observation boundary already exist.')


def snapshot():
    small = tuple(name for name in TABLES if name not in batches.KEYS)
    result = backups.database_snapshot(small, omit_columns=OMIT_COLUMNS,
        version_limit=92, include_reserved=True)
    result['tables'].update(batches.snapshot(backups.node, backups.URL_CHECK))
    result['ledger'] = int(capacity.psql(
        'SELECT used_bytes FROM hash_talk.content_usage WHERE singleton'))
    return result


def verify_migration(candidate, before):
    after, versions = snapshot(), base.attachment_versions(candidate)
    if (before['versions'] != versions[:91] or after['versions'] != versions
            or before['tables'] != after['tables']):
        raise RuntimeError('Account rankings changed existing rows or applied history.')
    seed_charge = int(capacity.psql('SELECT coalesce(sum(charge),0) FROM hash_talk.profile_ranking_state'))
    if after['ledger'] != before['ledger'] + seed_charge:
        raise RuntimeError('Account ranking seed charge differs from the global ledger delta.')
    base.verify_community_tables(TABLES + NEW_TABLES)
    if any(capacity.psql(sql) != b't' for sql in [SCHEMA_CHECK, COUNTER_CHECKS, GLOBAL_CHECK]):
        raise RuntimeError('Account ranking schema, seed, cache or capacity reconciliation failed.')


def activate(config, work, candidate, before_state):
    background.verify_current(config)
    parts.require_workers()
    result = base.activate_database(config, work, candidate, {
        'before_state': before_state, 'review': review, 'snapshot': snapshot,
        'versions': 91, 'verify': verify_migration,
        'stop_existing': background.stop, 'resume_existing': background.start,
        'start': background.start,
    })
    result['account_ranking_schema_versions'] = 92
    base.receipt(work, result)
    return result
