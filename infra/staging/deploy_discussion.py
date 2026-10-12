"""Reviewed 061→062 engagement transition inside the existing deployment executor."""
import json
import re
import deploy_remote as base
import deploy_blocks45 as backups
import deploy_background as background
import deploy_social_experience as social

BEFORE = 'e22b5e3eac26b78af927e424923bf664567f38ff'
REVIEWED = '09917b96e3ee1fda67fd89da4a5fe99bd3cbf2e3'
OLD_TABLES = social.OLD_TABLES + social.NEW_TABLES
NEW_TABLES = ('community_discussion_participants',)
OMIT_COLUMNS = {'community_posts': ('discussion_participants', 'discussion_activity', 'discussion_blocked'),
                'content_usage': ('used_bytes',)}
# Independent reconstruction from existing public records, including automatic refusals.
EXPECTED = """WITH RECURSIVE posts AS (
 SELECT p.*,EXISTS(SELECT 1 FROM hash_talk.public_moderation pm
   WHERE pm.kind='post-media' AND pm.target=ANY(p.media_ids)
   AND pm.status IN ('rejected','held','failed','discarding','expired')
   AND NOT EXISTS(SELECT 1 FROM hash_talk.public_moderation newer
     WHERE newer.kind=pm.kind AND newer.target=pm.target AND newer.status='approved'
       AND (newer.created_at,newer.id)>(pm.created_at,pm.id))) AS blocked
 FROM hash_talk.community_posts p
), ancestors AS (
 SELECT parent_id AS post_id,author AS profile_id FROM posts
 WHERE parent_id IS NOT NULL AND author IS NOT NULL AND NOT deleted AND active_removal IS NULL AND NOT blocked
 UNION ALL SELECT p.parent_id,a.profile_id FROM ancestors a JOIN posts p ON p.id=a.post_id WHERE p.parent_id IS NOT NULL
), participants AS (
 SELECT post_id,profile_id,count(*)::integer AS contributions,256 AS charge FROM ancestors GROUP BY post_id,profile_id
), metrics AS (
 SELECT p.id,p.blocked AS discussion_blocked,
   count(a.profile_id) FILTER(WHERE a.profile_id IS NOT NULL AND a.profile_id IS DISTINCT FROM p.author)::integer AS discussion_participants,
   coalesce(sum(4+least(a.contributions,2)) FILTER(WHERE a.profile_id IS NOT NULL AND a.profile_id IS DISTINCT FROM p.author),0)::bigint AS discussion_activity
 FROM posts p LEFT JOIN participants a ON a.post_id=p.id GROUP BY p.id,p.author,p.blocked
) SELECT json_build_object(
 'used_bytes',(SELECT used_bytes FROM hash_talk.content_usage WHERE singleton),
 'expected_used_bytes',(SELECT used_bytes FROM hash_talk.content_usage WHERE singleton)+256*(SELECT count(*) FROM participants),
 'participants',(SELECT json_build_object('count',count(*)::integer,'hash',md5(coalesce(string_agg(to_jsonb(a)::text,'' ORDER BY to_jsonb(a)::text),''))) FROM participants a),
 'metrics',(SELECT md5(coalesce(string_agg(to_jsonb(m)::text,'' ORDER BY to_jsonb(m)::text),'')) FROM metrics m))"""
ACTUAL = """SELECT json_build_object(
 'used_bytes',(SELECT used_bytes FROM hash_talk.content_usage WHERE singleton),
 'participants',(SELECT json_build_object('count',count(*)::integer,'hash',md5(coalesce(string_agg(to_jsonb(a)::text,'' ORDER BY to_jsonb(a)::text),''))) FROM hash_talk.community_discussion_participants a),
 'metrics',(SELECT md5(coalesce(string_agg(to_jsonb(m)::text,'' ORDER BY to_jsonb(m)::text),'')) FROM
 (SELECT id,discussion_blocked,discussion_participants,discussion_activity FROM hash_talk.community_posts) m))"""


def metadata(sql):
    raw = backups.pg(['psql', '--no-psqlrc', '--set=ON_ERROR_STOP=1', '--tuples-only', '--no-align', '-c', sql])
    return json.loads(raw)


def review(candidate, live):
    if not re.fullmatch(r'[a-f0-9]{40}', REVIEWED):
        raise RuntimeError('Discussion migration requires an exact source review.')
    base.reviewed_database(candidate, live, {'before': BEFORE, 'reviewed': REVIEWED, 'versions': 62, 'previous_versions': 61})
    base.verify_community_tables(OLD_TABLES)
    for unit in [base.UNIT, *background.UNITS]:
        if base.digest(candidate / 'infra/staging' / unit) != base.digest(live / 'infra/staging' / unit):
            raise RuntimeError('Discussion migration does not authorize service unit changes.')


def snapshot():
    value = backups.database_snapshot(OLD_TABLES, omit_columns=OMIT_COLUMNS)
    value.update(metadata(EXPECTED))
    return value


def verify_migration(candidate, before):
    after, versions = snapshot(), base.attachment_versions(candidate)
    actual = metadata(ACTUAL)
    checks = {
        'previous checksums': before['versions'] == versions[:61],
        'current checksums': after['versions'] == versions,
        'preserved tables': after['tables'] == before['tables'],
        'ledger': actual['used_bytes'] == before['expected_used_bytes'],
        'participants': actual['participants'] == before['participants'],
        'metrics': actual['metrics'] == before['metrics'],
    }
    failed = [name for name, valid in checks.items() if not valid]
    if failed:
        raise RuntimeError('Discussion preservation failed: ' + ', '.join(failed))
    base.verify_community_tables(OLD_TABLES + NEW_TABLES)
    sql = """SELECT (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgenabled='O'
      AND tgname IN ('discussion_participant_usage','discussion_participant_metrics','discussion_post_metrics',
        'discussion_post_visibility','discussion_moderation_visibility','community_ranking_discussion_visibility'))=6
      AND (SELECT count(*) FROM pg_indexes WHERE schemaname='hash_talk'
        AND indexname IN ('community_reply_first','community_reply_discussed','community_reply_votes','community_discussion_media_refs'))=4"""
    if backups.pg(['psql', '--no-psqlrc', '--set=ON_ERROR_STOP=1', '--tuples-only', '--no-align', '-c', sql]).strip() != b't':
        raise RuntimeError('Discussion migration triggers or indexes differ.')


def activate(config, work, candidate, before_state):
    background.verify_current(config)
    return base.activate_database(config, work, candidate, {
        'before_state': before_state, 'review': review, 'snapshot': snapshot,
        'versions': 61, 'verify': verify_migration,
        'stop_existing': background.stop, 'resume_existing': background.start, 'start': background.start,
    })
