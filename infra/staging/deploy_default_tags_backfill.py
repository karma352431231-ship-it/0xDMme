"""Exact 099→100 default post tag backfill inside the existing release executor.

Owner asked on 25/10/2026 for the eight newer default tags in existing active
communities. Only missing community_tags rows are added and charged to the
global ledger; every other table, row, trigger and accounting source stays
byte-identical."""
import json
import deploy_remote as base
import deploy_blocks45 as backups
import deploy_background as background
import deploy_post_search as previous

BEFORE = '7bfe75bdaa95b12d9630f84950525d57b79dca04'
REVIEWED = '398887a428208745bc0c7d83fb6fba94a3367782'
TABLES = previous.TABLES
# The backfill adds rows to one existing accounting source, not a new source.
COUNTER_CHECKS = previous.COUNTER_CHECKS
GLOBAL_CHECK = previous.GLOBAL_CHECK
# Rows land in community_tags; their charge lands in the global ledger table.
CHANGED = ('community_tags', 'content_usage_legacy')
LABELS = ('question', 'news', 'analysis', 'alpha', 'help', 'announcement', 'showcase', 'event')
_ARRAY = 'ARRAY[' + ','.join("'" + label + "'" for label in LABELS) + ']::text[]'
METRICS = """SELECT json_build_object(
 'preserved',(SELECT md5(coalesce(string_agg(to_jsonb(t)::text,'' ORDER BY to_jsonb(t)::text),''))
   FROM hash_talk.community_tags t WHERE lower(t.label)<>ALL(""" + _ARRAY + """)),
 'defaults',(SELECT count(*) FROM hash_talk.community_tags WHERE lower(label)=ANY(""" + _ARRAY + """)),
 'missing',(SELECT count(*) FROM hash_talk.communities c CROSS JOIN unnest(""" + _ARRAY + """) d(label)
   WHERE NOT c.archived AND NOT EXISTS(SELECT 1 FROM hash_talk.community_tags t
   WHERE t.community_id=c.id AND lower(t.label)=d.label)))::text"""


def review(candidate, live):
    base.reviewed_database(candidate, live, {'before': BEFORE, 'reviewed': REVIEWED,
        'versions': 100, 'previous_versions': 99})
    base.verify_community_tables(TABLES)
    for unit in [base.UNIT, *background.UNITS]:
        name = 'infra/staging/' + unit
        if base.digest(candidate / name) != base.digest(live / name):
            raise RuntimeError('Default tag backfill does not authorize unit changes.')
    # Writers are still online during review: each audit reads one stable view.
    if any(previous.directory.ranking.capacity.psql(
            'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;' + sql + ';ROLLBACK') != b't'
           for sql in [COUNTER_CHECKS, GLOBAL_CHECK]):
        raise RuntimeError('Default tag backfill predecessor accounting differs.')


def metrics():
    value = json.loads(previous.directory.ranking.capacity.psql(METRICS))
    if (sorted(value) != ['defaults', 'missing', 'preserved'] or type(value['preserved']) is not str
            or any(type(value[name]) is not int or value[name] < 0 for name in ['defaults', 'missing'])):
        raise RuntimeError('Default tag metrics are malformed.')
    return value


def snapshot():
    batches = previous.directory.ranking.batches
    small = tuple(name for name in TABLES if name not in batches.KEYS)
    result = backups.database_snapshot(small, version_limit=100, include_reserved=True)
    result['tables'].update(batches.snapshot(backups.node, backups.URL_CHECK))
    result['default_tags'] = metrics()
    return result


def verify_migration(candidate, before):
    after, versions = snapshot(), base.attachment_versions(candidate)
    kept = lambda tables: {name: value for name, value in tables.items() if name not in CHANGED}
    if (before['versions'] != versions[:99] or after['versions'] != versions
            or set(before['tables']) != set(after['tables'])
            or kept(before['tables']) != kept(after['tables'])):
        raise RuntimeError('Default tag backfill changed preserved data or migration history.')
    old, new = before['default_tags'], after['default_tags']
    if (new['preserved'] != old['preserved'] or new['missing'] != 0
            or new['defaults'] != old['defaults'] + old['missing']):
        raise RuntimeError('Default tag backfill changed existing tags or missed a community.')
    base.verify_community_tables(TABLES)
    if any(previous.directory.ranking.capacity.psql(sql) != b't' for sql in [COUNTER_CHECKS, GLOBAL_CHECK]):
        raise RuntimeError('Default tag capacity reconciliation failed.')


def activate(config, work, candidate, before_state):
    if config.get('default_tags') is not True:
        raise RuntimeError('Default tag backfill requires explicit --default-tags approval.')
    background.verify_current(config)
    previous.directory.ranking.parts.require_workers()
    result = base.activate_database(config, work, candidate, {
        'before_state': before_state, 'review': review, 'snapshot': snapshot,
        'versions': 99, 'verify': verify_migration,
        'stop_existing': background.stop, 'resume_existing': background.start,
        'start': background.start,
    })
    result['default_tags_schema_versions'] = 100
    base.receipt(work, result)
    return result
