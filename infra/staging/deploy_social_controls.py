"""Exact 055→058 social controls transition, invoked only through deploy.py."""

import json
import re

import deploy_remote as base
import deploy_blocks45 as backups
import deploy_background as background
import deploy_post_tags as tags

BEFORE = 'adc6b6e88b3e06aa905ff3b8e49a6e3237979649'
REVIEWED = 'UNREVIEWED'
OLD_TABLES = tags.OLD_TABLES + tags.NEW_TABLES
NEW_TABLES = ('community_badges', 'community_member_badges',
              'public_notification_reads', 'public_reports')
OMIT_COLUMNS = {
    'communities': ('pending_banner', 'pending_banner_type', 'pending_banner_review', 'pending_banner_hash'),
    'community_follows': ('joined_at',),
    'public_profile_follows': ('notifications', 'notification_revision', 'notification_since'),
    'content_usage': ('used_bytes',),
}


def review(candidate, live):
    if not re.fullmatch(r'[a-f0-9]{40}', REVIEWED):
        raise RuntimeError('Social controls transition requires an exact source review.')
    base.reviewed_database(candidate, live, {
        'before': BEFORE, 'reviewed': REVIEWED,
        'versions': 58, 'previous_versions': 55,
    })
    base.verify_community_tables(OLD_TABLES)
    for unit in background.UNITS:
        if base.digest(candidate / 'infra/staging' / unit) != base.digest(live / 'infra/staging' / unit):
            raise RuntimeError('Social controls review does not authorize worker unit changes.')
    sql = """SELECT NOT EXISTS(
      SELECT 1 FROM hash_talk.communities c WHERE c.owner IS NOT NULL
      AND NOT EXISTS(SELECT 1 FROM hash_talk.community_ranking_state r WHERE r.community_id=c.id))"""
    if backups.pg(['psql', '--no-psqlrc', '--set=ON_ERROR_STOP=1',
                   '--tuples-only', '--no-align', '-c', sql]).strip() != b't':
        raise RuntimeError('Existing owner communities lack ranking state; migration review refused.')


def snapshot():
    value = backups.database_snapshot(OLD_TABLES, omit_columns=OMIT_COLUMNS)
    # Predict only the approved missing owner follows and the trigger's one
    # ranking revision per added follow. No private content enters this metadata.
    sql = """WITH missing AS (
      SELECT c.id AS community_id,c.owner AS profile_id FROM hash_talk.communities c
      WHERE c.owner IS NOT NULL AND NOT EXISTS(SELECT 1 FROM hash_talk.community_follows f
        WHERE f.community_id=c.id AND f.profile_id=c.owner)
    ), follows AS (
      SELECT community_id,profile_id,charge FROM hash_talk.community_follows
      UNION ALL SELECT community_id,profile_id,128 FROM missing
    ), ranking AS (
      SELECT to_jsonb(r)||jsonb_build_object('revision',r.revision+
        CASE WHEN EXISTS(SELECT 1 FROM missing m WHERE m.community_id=r.community_id) THEN 1 ELSE 0 END) AS value
      FROM hash_talk.community_ranking_state r
    ) SELECT json_build_object(
      'used_bytes',(SELECT used_bytes FROM hash_talk.content_usage WHERE singleton),
      'expected_used_bytes',(SELECT used_bytes FROM hash_talk.content_usage WHERE singleton)+128*(SELECT count(*) FROM missing),
      'expected_follows',(SELECT json_build_object('count',count(*)::integer,
        'hash',md5(coalesce(string_agg(to_jsonb(f)::text,'' ORDER BY to_jsonb(f)::text),''))) FROM follows f),
      'expected_ranking',(SELECT json_build_object('count',count(*)::integer,
        'hash',md5(coalesce(string_agg(value::text,'' ORDER BY value::text),''))) FROM ranking))"""
    metadata = backups.pg(['psql', '--no-psqlrc', '--set=ON_ERROR_STOP=1',
                           '--tuples-only', '--no-align', '-c', sql])
    value.update(json.loads(metadata))
    return value


def verify_migration(candidate, before):
    after, versions = snapshot(), base.attachment_versions(candidate)
    expected = dict(before['tables'])
    expected['community_follows'] = before['expected_follows']
    expected['community_ranking_state'] = before['expected_ranking']
    if (before['versions'] != versions[:55] or after['versions'] != versions
            or after['tables'] != expected
            or after['used_bytes'] != before['expected_used_bytes']):
        raise RuntimeError('Social migration changed records, checksums or the approved owner-follow ledger.')
    base.verify_community_tables(OLD_TABLES + NEW_TABLES)
    empty = ' AND '.join('NOT EXISTS(SELECT 1 FROM hash_talk.' + table + ')' for table in NEW_TABLES)
    sql = """SELECT """ + empty + """ AND
      NOT EXISTS(SELECT 1 FROM hash_talk.community_follows WHERE joined_at IS NOT NULL) AND
      NOT EXISTS(SELECT 1 FROM hash_talk.communities WHERE pending_banner IS NOT NULL
        OR pending_banner_type IS NOT NULL OR pending_banner_review IS NOT NULL OR pending_banner_hash IS NOT NULL) AND
      NOT EXISTS(SELECT 1 FROM hash_talk.public_profile_follows
        WHERE notifications OR notification_revision<>0 OR notification_since IS NOT NULL) AND
      NOT EXISTS(SELECT 1 FROM hash_talk.communities c WHERE c.owner IS NOT NULL
        AND NOT EXISTS(SELECT 1 FROM hash_talk.community_follows f WHERE f.community_id=c.id AND f.profile_id=c.owner)) AND
      (SELECT count(*)=4 FROM pg_trigger WHERE NOT tgisinternal AND tgenabled='O'
        AND tgname IN ('community_badge_usage','community_member_badge_usage','public_notification_read_usage','public_report_usage')
        AND tgfoid='hash_talk.track_message_usage()'::regprocedure) AND
      (SELECT column_default='clock_timestamp()' FROM information_schema.columns
        WHERE table_schema='hash_talk' AND table_name='community_follows' AND column_name='joined_at')"""
    if backups.pg(['psql', '--no-psqlrc', '--set=ON_ERROR_STOP=1',
                   '--tuples-only', '--no-align', '-c', sql]).strip() != b't':
        raise RuntimeError('Social migration defaults, owner follows, empty tables or accounting triggers differ.')


def activate(config, work, candidate, before_state):
    background.verify_current(config)
    return base.activate_database(config, work, candidate, {
        'before_state': before_state, 'review': review, 'snapshot': snapshot,
        'versions': 55, 'verify': verify_migration,
        'stop_existing': background.stop, 'resume_existing': background.start,
        'start': background.start,
    })
