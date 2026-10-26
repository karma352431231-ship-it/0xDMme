"""Exact 099→102 collection transition inside the existing release executor."""

import deploy_remote as base
import deploy_blocks45 as backups
import deploy_background as background
import deploy_post_search as previous

BEFORE = 'b92200a34430b13f6d828c789ac43087571c4adc'
REVIEWED = 'a8f1f53d986956148b7b86a66afc314daa26cb05'
TABLES = previous.TABLES
NEW_TABLES = ('engagement_state', 'engagement_counts', 'engagement_entities',
              'engagement_contributors', 'engagement_visitors', 'engagement_observations',
              'engagement_erasure', 'engagement_snapshots', 'engagement_coverage',
              'engagement_operations', 'engagement_adjustments')
OMIT_COLUMNS = {'content_usage_legacy': ('used_bytes',)}
COUNTER_CHECKS = previous.COUNTER_CHECKS.replace('tgrelid)=85', 'tgrelid)=96')
GLOBAL_CHECK = previous.GLOBAL_CHECK.replace('sources<>85', 'sources<>96')
ABSENT = "SELECT to_regclass('hash_talk.engagement_state') IS NULL"
METRIC_CHARGE = 'SELECT ' + '+'.join(
    '(SELECT coalesce(sum(charge),0) FROM hash_talk.' + name + ')' for name in NEW_TABLES) + ' AS bytes'
SCHEMA_CHECK = """SELECT
 (SELECT count(*)=1 AND bool_and(started_at<=clock_timestamp()
   AND heartbeat_at IS NULL AND snapshot_at IS NULL AND correction_revision=1
   AND snapshot_generation=0 AND contributors_reset_at IS NULL) FROM hash_talk.engagement_state)
 AND hash_talk.engagement_technical_retention()=interval '7 days'
 AND NOT EXISTS(SELECT 1 FROM hash_talk.engagement_counts
   WHERE metric NOT IN ('accounts_existing','public_profiles_existing','upvotes_current','downvotes_current'))
 AND NOT EXISTS(SELECT 1 FROM hash_talk.engagement_contributors)
 AND NOT EXISTS(SELECT 1 FROM hash_talk.engagement_visitors)
 AND NOT EXISTS(SELECT 1 FROM hash_talk.engagement_observations)
 AND NOT EXISTS(SELECT 1 FROM hash_talk.engagement_snapshots)
 AND NOT EXISTS(SELECT 1 FROM hash_talk.engagement_coverage)
 AND NOT EXISTS(SELECT 1 FROM hash_talk.engagement_operations)
 AND NOT EXISTS(SELECT 1 FROM hash_talk.engagement_adjustments)
 AND (SELECT count(*)=(SELECT count(*) FROM hash_talk.communities)
   +(SELECT count(*) FROM hash_talk.community_posts) FROM hash_talk.engagement_entities)
 AND NOT EXISTS(SELECT 1 FROM hash_talk.communities c LEFT JOIN hash_talk.engagement_entities e
   ON e.scope='community' AND e.id=c.id
   WHERE e.id IS NULL OR e.kind<>'community' OR e.community<>c.id OR e.erased OR e.eligible=c.archived)
 AND NOT EXISTS(SELECT 1 FROM hash_talk.community_posts p LEFT JOIN hash_talk.engagement_entities e
   ON e.scope='post' AND e.id=p.id
   WHERE e.id IS NULL OR e.community<>p.community_id OR e.root IS DISTINCT FROM p.root_id
   OR e.parent IS DISTINCT FROM p.parent_id OR e.erased<>p.deleted OR NOT e.publication_seen
   OR e.kind<>CASE WHEN p.parent_id IS NULL THEN 'post' ELSE 'reply' END
   OR e.eligible<>hash_talk.public_post_is_visible(p.deleted,p.active_removal,p.media_ids))
 AND NOT EXISTS(WITH wanted AS (SELECT * FROM hash_talk.engagement_current_gauges('project',NULL)),
   recorded AS (SELECT metric,sum(value) AS value FROM hash_talk.engagement_counts
     WHERE scope='project' GROUP BY metric)
   SELECT 1 FROM wanted w FULL JOIN recorded r USING(metric)
   WHERE coalesce(w.value,0)<>coalesce(r.value,0))
 AND (SELECT count(*)=11 FROM pg_trigger WHERE NOT tgisinternal AND tgenabled='O'
   AND tgname IN ('engagement_account_fact','engagement_profile_fact','engagement_community_fact',
     'engagement_post_fact','engagement_media_visibility','engagement_media_attachment',
     'engagement_author_erasure','engagement_view_fact','engagement_share_fact',
     'engagement_vote_fact','engagement_erasure_work'))"""


def review(candidate, live):
    base.reviewed_database(candidate, live, {'before': BEFORE, 'reviewed': REVIEWED,
        'versions': 102, 'previous_versions': 99})
    base.verify_community_tables(TABLES)
    for unit in [base.UNIT, *background.UNITS]:
        name = 'infra/staging/' + unit
        if base.digest(candidate / name) != base.digest(live / name):
            raise RuntimeError('Metric collection does not authorize unit changes.')
    sql = previous.directory.ranking.capacity
    if sql.psql(ABSENT) != b't':
        raise RuntimeError('Metric collection predecessor schema differs.')
    for check in [previous.COUNTER_CHECKS, previous.GLOBAL_CHECK]:
        if sql.psql('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;' + check + ';ROLLBACK') != b't':
            raise RuntimeError('Metric predecessor accounting differs.')


def snapshot():
    batches = previous.directory.ranking.batches
    small = tuple(name for name in TABLES if name not in batches.KEYS)
    result = backups.database_snapshot(small, omit_columns=OMIT_COLUMNS,
        version_limit=102, include_reserved=True)
    result['tables'].update(batches.snapshot(backups.node, backups.URL_CHECK))
    result['ledger'] = int(previous.directory.ranking.capacity.psql(
        'SELECT used_bytes FROM hash_talk.content_usage WHERE singleton'))
    return result


def verify_migration(candidate, before):
    after, versions = snapshot(), base.attachment_versions(candidate)
    if (before['versions'] != versions[:99] or after['versions'] != versions
            or before['tables'] != after['tables']):
        raise RuntimeError('Metric collection changed existing rows, tags, quotas or migration history.')
    sql = previous.directory.ranking.capacity
    if after['ledger'] != before['ledger'] + int(sql.psql(METRIC_CHARGE)):
        raise RuntimeError('Metric baseline charge differs from the global ledger delta.')
    base.verify_community_tables(TABLES + NEW_TABLES)
    if any(sql.psql(check) != b't' for check in [SCHEMA_CHECK, COUNTER_CHECKS, GLOBAL_CHECK]):
        raise RuntimeError('Metric baseline, schema or accounting reconciliation failed.')


def activate(config, work, candidate, before_state):
    if config.get('engagement') is not True:
        raise RuntimeError('Metric collection requires explicit --engagement approval.')
    background.verify_current(config)
    previous.directory.ranking.parts.require_workers()
    result = base.activate_database(config, work, candidate, {
        'before_state': before_state, 'review': review, 'snapshot': snapshot,
        'versions': 99, 'verify': verify_migration,
        'stop_existing': background.stop, 'resume_existing': background.start,
        'start': background.start,
    })
    result['engagement_schema_versions'] = 102
    base.receipt(work, result)
    return result
