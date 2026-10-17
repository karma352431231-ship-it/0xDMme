"""Exact owner-requested 090→091 correction, through the existing deploy.py only."""
import re

import deploy_remote as base
import deploy_blocks45 as backups
import deploy_background as background
import deploy_capacity_database as capacity

BEFORE = '1b5c1e753608c989bfbcdd7414fb74f7d5d8d790'
REVIEWED = 'd1258c06548d8243a0dd36af8765c31e07cf301f'
TABLES = capacity.TABLES
CHECK = """SELECT pg_get_constraintdef(oid)||'/'||convalidated::text
 FROM pg_constraint WHERE conrelid='hash_talk.group_media'::regclass
 AND conname='group_media_received_check' AND contype='c'"""
BEFORE_CHECK = b'CHECK ((cardinality(received) <= 12))/true'
AFTER_CHECK = b'CHECK ((cardinality(received) <= 39))/true'
# Credits may legitimately exist after initial activation; the exact snapshot
# preserves them. Reconcile counters without requiring the initial empty state.
COUNTER_CHECKS = capacity.CHECKS.replace(
    '  AND NOT EXISTS(SELECT 1 FROM hash_talk.content_allocations)\n', '')


def review(candidate, live):
    if not all(re.fullmatch(r'[a-f0-9]{40}', value) for value in [BEFORE, REVIEWED]):
        raise RuntimeError('Group part correction requires exact source review.')
    base.reviewed_database(candidate, live, {'before': BEFORE, 'reviewed': REVIEWED,
        'versions': 91, 'previous_versions': 90})
    base.verify_community_tables(TABLES)
    for unit in [base.UNIT, *background.UNITS]:
        name = 'infra/staging/' + unit
        if base.digest(candidate / name) != base.digest(live / name):
            raise RuntimeError('Group part correction does not authorize unit changes.')
    if capacity.psql(CHECK) != BEFORE_CHECK:
        raise RuntimeError('Group part predecessor constraint differs.')
    capacity.volume_review()


def snapshot():
    # Preserve all columns, including pending reserved bytes, and the global view.
    return backups.database_snapshot(TABLES + ('content_usage',),
        version_limit=91, include_reserved=True)


def verify_migration(candidate, before):
    after, versions = snapshot(), base.attachment_versions(candidate)
    if (before['versions'] != versions[:90] or after['versions'] != versions
            or before['tables'] != after['tables']):
        raise RuntimeError('Group part correction changed rows, charges or applied history.')
    base.verify_community_tables(TABLES)
    if capacity.psql(CHECK) != AFTER_CHECK:
        raise RuntimeError('Group part constraint is not the validated thirty-nine bound.')
    if capacity.psql(COUNTER_CHECKS) != b't' or capacity.psql(capacity.GLOBAL_CHECK) != b't':
        raise RuntimeError('Group part correction failed capacity reconciliation.')


def require_workers():
    for unit in background.UNITS:
        if base.run(['systemctl', 'show', unit, '--property=LoadState', '--value']).strip() != b'loaded':
            raise RuntimeError('Own worker is not loaded; refusing maintenance.')
    if not background.ready():
        raise RuntimeError('Own worker leases are not ready; refusing maintenance.')


def activate(config, work, candidate, before_state):
    background.verify_current(config)
    require_workers()
    result = base.activate_database(config, work, candidate, {
        'before_state': before_state, 'review': review, 'snapshot': snapshot,
        'versions': 90, 'verify': verify_migration,
        'stop_existing': background.stop, 'resume_existing': background.start,
        'start': background.start,
    })
    result['group_media_parts_schema_versions'] = 91
    base.receipt(work, result)
    return result
