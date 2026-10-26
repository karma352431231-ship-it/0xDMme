"""Bounded release activation. Access/inventory arrive through private stdin."""

import base64
from contextlib import contextmanager
import fcntl
import hashlib
import io
import json
import os
from pathlib import Path
import re
import resource
import shlex
import shutil
import subprocess
import sys
import tarfile
import time

import deploy_archive as release_archive
import deploy_artifacts as artifacts
from deploy_archive import digest, valid_release_branch
from deploy_artifacts import receipt, verified_code_failure
from deploy_reviewed_code import database_code_reviewed, database_files, reviewed_lockfile_change

import deploy_sources as public_sources
import deploy_runtime as runtime

DATA = Path('/var/lib/0xdmme/data')
UNIT = '0xdmme-test.service'
ORIGIN = 'https://0xdmme.app'
MAX_ARCHIVE = 16 * 1024 * 1024
MAX_RELEASE = 128 * 1024 * 1024
MEASUREMENTS = {}


@contextmanager
def measured(stage):
    """Only fixed phase labels and elapsed/CPU seconds enter private deploy logs."""
    def cpu():
        own = resource.getrusage(resource.RUSAGE_SELF)
        children = resource.getrusage(resource.RUSAGE_CHILDREN)
        return own.ru_utime + own.ru_stime + children.ru_utime + children.ru_stime
    started, used = time.monotonic(), cpu()
    try:
        yield
    finally:
        value = MEASUREMENTS.setdefault(stage, {'calls': 0, 'seconds': 0, 'cpu_seconds': 0})
        value['calls'] += 1
        value['seconds'] = round(value['seconds'] + time.monotonic() - started, 3)
        value['cpu_seconds'] = round(value['cpu_seconds'] + cpu() - used, 3)


# Bound serialized metadata instead of authored module count. One MiB fits beside
# the maximum base64 archive within the existing 24 MiB deployment input budget.
# Owner-approved on 17/10/2026; transfer/extraction/runtime byte budgets stay fixed.
MAX_MANIFEST_BYTES = 1024 * 1024
# Paths reviewed for earlier transitions; kept because other checks name them.
REQUEST_DIAGNOSTIC_FILES = frozenset([
    'src/client/api-response/index.ts', 'infra/staging/deploy_request_limit.py',
])
# Local ranking cuts add exactly these authored paths to source preparation.
# This is not approval to activate them or migrate 043 -> 047. Unknown files
# and archive/extraction/runtime budgets remain blocked by the existing guards.
RANKING_SOURCE_FILES = frozenset([
    'src/server/community-ranking/index.ts',
    'src/server/database/community-ranking-metrics.ts',
    'src/server/database/community-ranking.ts',
    'src/server/database/work-signals.ts',
    'src/server/work-scheduler/index.ts',
    'src/shared/community-ranking/index.ts',
    'src/server/database/migrations/044-community-ranking.sql',
    'src/server/database/migrations/045-ranking-rounds.sql',
    'src/server/database/migrations/046-ranking-batch-accounting.sql',
    'src/server/database/migrations/047-ranking-cache-budget.sql',
])
# Views and isolated worker paths requested on 08/10/2026. Exact paths only.
BACKGROUND_SOURCE_FILES = frozenset([
    'src/shared/community-views/index.ts', 'src/client/communities/post-views.ts',
    'src/server/communities/views.ts', 'src/server/database/community-views.ts',
    'src/server/database/migrations/048-community-post-views.sql',
    'src/server/database/migrations/049-maintenance-work-signals.sql',
    'src/server/background/index.ts', 'src/server/content-maintenance/index.ts',
    'src/server/public-maintenance/index.ts', 'src/server/community-media/collector.ts',
    'src/server/worker.ts', 'infra/staging/deploy_background.py',
    'infra/staging/0xdmme-ranking-worker.service',
    'infra/staging/0xdmme-content-worker.service',
    'infra/staging/0xdmme-public-worker.service', 'infra/staging/0xdmme-background.conf',
])
# Explicit block 08 approval (03/10/2026), bound to the deployed predecessor
# and reviewed application. This is not a general migration override.
ATTACHMENT_BEFORE = '931b09b4171269663e2c8aab813cff24da1c7bf5'
ATTACHMENT_REVIEWED = '121a4eb76e776109ce972633a4681416598cfce1'
ATTACHMENT_TABLES = ('accounts', 'content_usage', 'device_directories', 'device_events',
                     'device_links', 'login_challenges', 'login_devices', 'login_handoffs',
                     'login_sessions', 'service_metadata', 'vault_heads', 'vault_operations',
                     'contact_controls', 'contact_relations', 'contact_blocks',
                     'message_recovery_keys', 'message_packets', 'message_references',
                     'message_heads', 'matrix_devices', 'matrix_one_time_keys', 'matrix_envelopes')
# Explicit block 09 publication request (03/10/2026); exact 016→017 only.
BACKUP_BEFORE = '8acc99d0de9526f46ee78e6d49261b1b36b192e4'
BACKUP_REVIEWED = '343d334f50a154b17a0d14348772f7de1397ec8d'
BACKUP_TABLES = ATTACHMENT_TABLES + ('message_attachments',)
# Owner requested block 10 publication (03/10/2026). Exact 017→018 and push lock.
DAILY_BEFORE = '62781eb11d2d8fd4c36bd10c6cd8c6d0d1be4953'
DAILY_REVIEWED = '1f4d33cdb4b83f571607c79a7366ad1eab1d73ee'
DAILY_TABLES = BACKUP_TABLES + ('personal_removals',)
DAILY_NEW_TABLES = ('daily_controls', 'conversation_controls', 'device_presence',
                    'push_subscriptions', 'message_reads')
# Owner approved the simplified experience and its pending migration on 04/10/2026.
# Keep the existing executor, exact live predecessor and reviewed app sources.
LINKED_BEFORE = '9ed5988f91dc45bf18bf339e5d7ca6c2d58643cb'
LINKED_REVIEWED = '3520812502c7731cea7e58e91c990b9528d7c05e'
LINKED_TABLES = DAILY_TABLES + DAILY_NEW_TABLES
# Owner requested block 11 activation on 04/10/2026. Exact 019→024 only,
# preserving the live runtime and all prior account/chat data.
GROUPS_BEFORE = 'f7b48bb7fd942d5a1987ca3fb9055b9c4c5dc129'
GROUPS_REVIEWED = 'aab78effb21a8523a79ab87728aeef9cded49ab1'
GROUPS_TABLES = LINKED_TABLES
GROUPS_NEW_TABLES = ('groups', 'group_events', 'group_members', 'group_consents',
                    'group_creation_window', 'group_key_sets', 'group_packets',
                    'group_matrix_envelopes', 'group_media', 'group_cleanups',
                    'status_posts', 'status_recipients', 'status_pages',
                    'status_media', 'group_controls', 'group_reads')
# Prepared block 12A review (05/10/2026); activation still requires owner approval.
# Exact 024→025, with all 45 existing tables and unchanged runtime preserved.
REPRESENTATIVES_BEFORE = '2772aba4df7f24f1f52dcc96f355f3a6bc75a076'
REPRESENTATIVES_REVIEWED = 'c70eeed8b09b21c10ee03175e0032339f0632f5d'
REPRESENTATIVES_TABLES = GROUPS_TABLES + GROUPS_NEW_TABLES
REPRESENTATIVES_NEW_TABLES = ('organizations', 'representative_credentials',
                             'organization_domains')
# Owner approved calls/push activation and their isolated infrastructure on
# 05/10/2026. Exact 025→027, without runtime/dependency changes or data rewrites.
CALLS_BEFORE = '793bf21f9f0b66cc58fee21fe6a65eccdeb84e98'
CALLS_REVIEWED = '537240c02377a7217196a678051758b62ff0fece'
CALLS_TABLES = REPRESENTATIVES_TABLES + REPRESENTATIVES_NEW_TABLES
CALLS_NEW_TABLES = ('call_controls', 'push_controls')
# Owner requested activation of the remaining normal flows on 07/10/2026,
# after being informed of the pending database transition. Exact 027→043 only.
# Public tables do not exist in the predecessor: no legacy public bytes are lost.
# The experimental gallery and unaccepted detector are outside this deployment.
COMMUNITIES_BEFORE = '44af35f99bcb493413af984aa3a7d15b32af194e'
COMMUNITIES_REVIEWED = '04b1bbf5db5b4c30387cc23a792624a1b3b67a87'
COMMUNITIES_TABLES = CALLS_TABLES + CALLS_NEW_TABLES
COMMUNITIES_NEW_TABLES = ('public_profiles', 'communities', 'community_follows',
    'community_moderators', 'community_sanctions', 'community_reports',
    'community_tags', 'community_posts', 'community_post_removals',
    'community_votes', 'community_reply_notifications', 'community_post_preferences',
    'social_relations', 'social_blocks', 'social_directories', 'social_devices',
    'social_recovery', 'social_matrix_devices', 'social_matrix_keys',
    'social_matrix_envelopes', 'social_messages', 'social_personal_secrets',
    'social_media', 'social_receipts', 'community_media', 'public_moderation')


def run(args, timeout=30, env=None):
    return subprocess.run(args, check=True, capture_output=True, timeout=timeout, env=env).stdout


# Stable executor APIs are also used by reviewed historical transition modules.
# Budgets and the private root remain explicit inputs to their owning modules.
def archive_policy():
    return release_archive.ReleaseArchive(MAX_MANIFEST_BYTES, MAX_ARCHIVE, MAX_RELEASE)


def validate_manifest_budget(config):
    return archive_policy().validate_manifest_budget(config)


def validate(config):
    return archive_policy().validate(config)


def extract(archive, destination, allowed):
    return archive_policy().extract(archive, destination, allowed)


def prune_completed(current, dry_run=False):
    return artifacts.prune_completed(current, dry_run, data=DATA, archive_bytes=MAX_ARCHIVE)


def retention_capacity(current):
    return artifacts.retention_capacity(current, data=DATA, archive_bytes=MAX_ARCHIVE)


def retain_migration_backup(work, old):
    return artifacts.retain_migration_backup(work, old, data=DATA, archive_bytes=MAX_ARCHIVE)


def retain_failure_receipt(state):
    return artifacts.retain_failure_receipt(state, data=DATA)


def preservation(baseline):
    # Private baseline describes only the already-inventoried existing services.
    for name, expected in baseline['files'].items():
        if digest(Path(name)) != expected:
            raise RuntimeError('Existing configuration changed.')
    for unit, expected in baseline['services'].items():
        actual = run(['systemctl', 'show', unit,
                      '--property=MainPID,ActiveState,ExecMainStartTimestampMonotonic']).decode()
        if actual != expected:
            raise RuntimeError('Existing service changed or restarted.')
    for site in baseline['sites']:
        host = site['host']
        actual = run(['curl', '--silent', '--output', '/dev/null', '--write-out', '%{http_code}',
                      '--max-time', '5', '--resolve', host + ':443:127.0.0.1',
                      'https://' + host + '/'], timeout=10).decode()
        if actual != site['status']:
            raise RuntimeError('Existing site response changed.')


def own_state():
    paths = [Path('/etc/0xdmme'), Path('/etc/nginx/sites-available/0xdmme-test.conf')]
    paths += list(Path('/etc/systemd/system').glob('0xdmme*'))
    paths += list(Path('/etc/systemd/system').glob('xdmme*'))
    paths += [Path('/etc/systemd/system/var-lib-0xdmme-data.mount')]
    files = set()
    for path in paths:
        if path.is_dir():
            files.update(p for p in path.rglob('*') if p.is_file())
        elif path.is_file():
            files.add(path)
    if len(files) > 128:
        raise RuntimeError('Unexpected own configuration size.')
    hashes = {str(p): digest(p) for p in sorted(files)}
    postgres = run(['systemctl', 'show', '0xdmme-postgres-test.service',
                    '--property=MainPID,ActiveState,ExecMainStartTimestampMonotonic']).decode()
    return {'files': hashes, 'postgres': postgres}


def fetch(path, expected=None):
    limit = 8 * 1024 * 1024 if path == '/matrix-crypto-18.9.0.wasm' else 2 * 1024 * 1024
    # Main corresponding sources have no separate 2 MiB ceiling. Their download
    # remains bounded by the existing budget for the entire extracted release.
    if re.fullmatch(r'/source-[a-f0-9]{16}\.tar\.gz', path):
        limit = MAX_RELEASE
    args = ['curl', '--silent', '--fail', '--max-time', '10', '--max-filesize', str(limit)]
    if expected:
        args += ['--header', 'If-None-Match: "' + expected + '"', '--write-out', '\n%{http_code}']
    result = run([*args, ORIGIN + path], timeout=15)
    if expected:
        result, separator, status = result.rpartition(b'\n')
        if not separator or status not in [b'200', b'304']:
            raise RuntimeError('Unexpected public validation response.')
        if status == b'304':
            if result:
                raise RuntimeError('Conditional response unexpectedly contains content.')
            return None
    if len(result) > limit:
        raise RuntimeError('Public response budget exceeded.')
    return result


def healthy(files=None):
    if json.loads(fetch('/health/ready')).get('status') != 'ok':
        raise RuntimeError('Own service not ready.')
    if files:
        for name, expected in files.items():
            if name.startswith('dist/web/') and name != 'dist/web/assets.json':
                # Respect this site's existing request budget, including fast 304s.
                time.sleep(0.25)
                url = '/' if name.endswith('/index.html') else '/' + name[len('dist/web/'):]
                result = fetch(url, expected)
                # A matching SHA-256 ETag is calculated from the loaded public
                # bytes by the app. Old servers without it return the full body.
                if result is not None and hashlib.sha256(result).hexdigest() != expected:
                    raise RuntimeError('Public build/source digest mismatch.')


def wait_ready(files=None):
    # Loading/hash-checking corresponding sources under the existing I/O budget
    # can take over ten seconds. The whole executor remains bounded at 240s;
    # wait at most 60s for readiness, then verify the public manifest once.
    deadline = time.monotonic() + 60
    while True:
        try:
            healthy()
            break
        except (RuntimeError, subprocess.SubprocessError):
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise RuntimeError('Own service did not become ready.') from None
            time.sleep(min(2, remaining))
    if files:
        healthy(files)


def compatibility(candidate, live):
    daily = digest(live / 'package-lock.json') == runtime.BEFORE_LOCK and digest(candidate / 'package-lock.json') == runtime.REVIEWED_LOCK
    if daily:
        daily_review(candidate, live)
    # Startup calls migrate(); guard both SQL and the code that executes it.
    for name in ['src/server/database', 'package-lock.json', '.nvmrc']:
        before, after = live / name, candidate / name
        if name == '.nvmrc' and not before.exists():
            # Earlier runtime exports omitted .nvmrc. Confirm runtime major below.
            continue
        if before.is_dir() and after.is_dir():
            old, new = database_files(live), database_files(candidate)
            if old != new and not database_code_reviewed(candidate, live):
                database_review(candidate, live)
        elif not before.is_file() or not after.is_file():
            raise RuntimeError('Runtime dependency/Node change requires separate review.')
        elif digest(before) != digest(after):
            if name != 'package-lock.json' or not (daily or reviewed_lockfile_change(before, after)):
                raise RuntimeError('Runtime dependency/Node change requires separate review.')
    previous = json.loads((live / 'package.json').read_text())
    incoming = json.loads((candidate / 'package.json').read_text())
    for key in ['dependencies', 'overrides', 'engines', 'type']:
        if previous.get(key) != incoming.get(key) and not (daily and key == 'dependencies'):
            raise RuntimeError('Runtime contract changed; separate review required.')
    constraint = incoming.get('engines', {}).get('node', '')
    approved = re.fullmatch(r'>=(\d+)\.(\d+)\.(\d+) <(\d+)', constraint)
    installed = re.fullmatch(r'v(\d+)\.(\d+)\.(\d+)',
                             run(['/usr/bin/node', '--version']).decode().strip())
    if not approved or not installed:
        raise RuntimeError('Node version/constraint could not be validated.')
    minimum = tuple(int(approved.group(index)) for index in [1, 2, 3])
    actual = tuple(int(installed.group(index)) for index in [1, 2, 3])
    if actual < minimum or actual >= (int(approved.group(4)), 0, 0):
        raise RuntimeError('Installed Node is outside the approved runtime range.')


def reviewed_database(candidate, live, approval):
    import deploy_blocks45 as backups
    paths = sorted((candidate / 'src/server/database/migrations').glob('*.sql'))
    count = approval['versions']
    if len(paths) != count or [p.name[:3] for p in paths] != ['%03d' % n for n in range(1, count + 1)]:
        raise RuntimeError('Reviewed migration sequence differs.')
    previous = backups.git_export(approval['before'])
    approved = backups.git_export(approval['reviewed'])
    if not backups.matches_export(live, previous) or not backups.matches_export(candidate, approved):
        raise RuntimeError('Database transition differs from the exact reviewed sources.')
    if approval.get('runtime'):
        runtime.review_contract(candidate, live)
    elif any(previous[name] != approved[name] for name in ['package-lock.json', '.nvmrc']):
        raise RuntimeError('Migration approval does not include dependency/Node changes.')
    previous_count = approval.get('previous_versions', count - 1)
    previous_migrations = {name for name in previous if name.startswith('src/server/database/migrations/')}
    expected_previous = {'src/server/database/migrations/' + path.name for path in paths[:previous_count]}
    if not 0 < previous_count < count or previous_migrations != expected_previous:
        raise RuntimeError('Reviewed predecessor migration sequence differs.')
    for path in paths[:previous_count]:
        name = 'src/server/database/migrations/' + path.name
        if previous.get(name) != approved.get(name):
            raise RuntimeError('Reviewed transition changes a previously applied migration.')


def attachment_review(candidate, live):
    reviewed_database(candidate, live, {'before':ATTACHMENT_BEFORE,
        'reviewed':ATTACHMENT_REVIEWED, 'versions':16})


def backup_review(candidate, live):
    reviewed_database(candidate, live, {'before':BACKUP_BEFORE,
        'reviewed':BACKUP_REVIEWED, 'versions':17})


def database_review(candidate, live):
    count = len(list((candidate / 'src/server/database/migrations').glob('*.sql')))
    if count == 102:
        import deploy_engagement
        return deploy_engagement.review(candidate, live)
    if count == 99:
        import deploy_post_share_counts
        return deploy_post_share_counts.review(candidate, live)
    if count == 98:
        import deploy_group_fences
        return deploy_group_fences.review(candidate, live)
    if count == 97:
        import deploy_community_games
        return deploy_community_games.review(candidate, live)
    if count == 96:
        import deploy_message_sync
        return deploy_message_sync.review(candidate, live)
    if count == 95:
        import deploy_post_search
        return deploy_post_search.review(candidate, live)
    if count == 94:
        import deploy_contact_invitations
        return deploy_contact_invitations.review(candidate, live)
    if count == 93:
        import deploy_profile_directory
        return deploy_profile_directory.review(candidate, live)
    if count == 92:
        import deploy_account_rankings
        return deploy_account_rankings.review(candidate, live)
    if count == 91:
        import deploy_group_media_parts
        return deploy_group_media_parts.review(candidate, live)
    if count == 90:
        import deploy_capacity_database
        return deploy_capacity_database.review(candidate, live)
    if count == 72:
        import deploy_community_addresses
        return deploy_community_addresses.review(candidate, live)
    if count == 71:
        import deploy_chat_attachments
        return deploy_chat_attachments.review(candidate, live)
    if count == 70:
        import deploy_ranking_activity
        return deploy_ranking_activity.review(candidate, live)
    if count == 69:
        import deploy_social_reactions
        return deploy_social_reactions.review(candidate, live)
    if count == 68:
        import deploy_public_upvotes
        return deploy_public_upvotes.review(candidate, live)
    if count == 67:
        import deploy_community_classification
        return deploy_community_classification.review(candidate, live)
    if count == 66:
        import deploy_message_changes
        return deploy_message_changes.review(candidate, live)
    if count == 64:
        import deploy_mentions
        return deploy_mentions.review(candidate, live)
    if count == 62:
        import deploy_discussion
        return deploy_discussion.review(candidate, live)
    if count == 61:
        import deploy_social_experience
        return deploy_social_experience.review(candidate, live)
    if count == 58:
        import deploy_social_controls
        return deploy_social_controls.review(candidate, live)
    if count == 55:
        import deploy_post_tags
        return deploy_post_tags.review(candidate, live)
    if count == 54:
        import deploy_group_links
        return deploy_group_links.review(candidate, live)
    if count == 53:
        import deploy_profile_description
        return deploy_profile_description.review(candidate, live)
    if count == 52:
        import deploy_profile_social
        return deploy_profile_social.review(candidate, live)
    if count == 49:
        import deploy_background
        return deploy_background.review(candidate, live)
    if count == 43:
        return communities_review(candidate, live)
    if count == 27:
        return calls_review(candidate, live)
    if count == 25:
        return representatives_review(candidate, live)
    if count == 24:
        return groups_review(candidate, live)
    if count == 19:
        return linked_review(candidate, live)
    if count == 18:
        return daily_review(candidate, live)
    if count == 17:
        return backup_review(candidate, live)
    if count == 16:
        return attachment_review(candidate, live)
    raise RuntimeError('Database change requires a separately pinned review.')


def daily_review(candidate, live):
    reviewed_database(candidate, live, {'before':DAILY_BEFORE,
        'reviewed':DAILY_REVIEWED, 'versions':18, 'runtime':True})


def linked_review(candidate, live):
    reviewed_database(candidate, live, {'before':LINKED_BEFORE,
        'reviewed':LINKED_REVIEWED, 'versions':19})


def groups_review(candidate, live):
    reviewed_database(candidate, live, {'before':GROUPS_BEFORE,
        'reviewed':GROUPS_REVIEWED, 'versions':24, 'previous_versions':19})


def groups_snapshot():
    import deploy_blocks45 as backups
    # No projection: wallet confirmation and every prior chat field are preserved.
    return backups.database_snapshot(GROUPS_TABLES)


def representatives_review(candidate, live):
    reviewed_database(candidate, live, {'before':REPRESENTATIVES_BEFORE,
        'reviewed':REPRESENTATIVES_REVIEWED, 'versions':25})


def representatives_snapshot():
    import deploy_blocks45 as backups
    return backups.database_snapshot(REPRESENTATIVES_TABLES)


def calls_review(candidate, live):
    reviewed_database(candidate, live, {'before':CALLS_BEFORE,
        'reviewed':CALLS_REVIEWED, 'versions':27, 'previous_versions':25})


def calls_snapshot():
    import deploy_blocks45 as backups
    return backups.database_snapshot(CALLS_TABLES)


def communities_review(candidate, live):
    reviewed_database(candidate, live, {'before':COMMUNITIES_BEFORE,
        'reviewed':COMMUNITIES_REVIEWED, 'versions':43, 'previous_versions':27})
    verify_community_tables(COMMUNITIES_TABLES)


def communities_snapshot():
    import deploy_blocks45 as backups
    # Partial migrations must remain readable so the existing rollback can
    # compare them with the backup and restore before opening the writer.
    return backups.database_snapshot(COMMUNITIES_TABLES)


def verify_community_tables(expected):
    import deploy_blocks45 as backups
    reviewed = set(expected) | {'schema_migrations'}
    # Include the whole reviewed set plus one row to detect unexpected tables.
    limit = len(reviewed) + 1
    tables = backups.pg(['psql', '--no-psqlrc', '--set=ON_ERROR_STOP=1',
        '--tuples-only', '--no-align', '-c',
        "SELECT tablename FROM pg_tables WHERE schemaname='hash_talk' ORDER BY tablename LIMIT " + str(limit)])
    if set(tables.decode().splitlines()) != reviewed:
        raise RuntimeError('Community transition table set differs; existing data not reviewed.')


def verify_communities_migration(candidate, before):
    import deploy_blocks45 as backups
    after, versions = communities_snapshot(), attachment_versions(candidate)
    if (before['versions'] != versions[:27] or after['versions'] != versions
            or after['tables'] != before['tables']):
        raise RuntimeError('Community migration/data preservation failed.')
    verify_community_tables(COMMUNITIES_TABLES + COMMUNITIES_NEW_TABLES)
    total = content_total()
    for table in ('personal_removals',) + DAILY_NEW_TABLES + GROUPS_NEW_TABLES + REPRESENTATIVES_NEW_TABLES + CALLS_NEW_TABLES:
        total += ' + coalesce((SELECT sum(charge) FROM hash_talk.' + table + '),0)'
    # No public/social records may exist before opening the writer. This also
    # verifies that legacy moderation cleanup cannot discard previous uploads.
    empty = ' AND '.join('NOT EXISTS(SELECT 1 FROM hash_talk.' + table + ')' for table in COMMUNITIES_NEW_TABLES)
    actual = backups.pg(['psql', '--no-psqlrc', '--set=ON_ERROR_STOP=1', '--tuples-only', '--no-align', '-c',
        'SELECT used_bytes=(' + total + ') AND ' + empty +
        ' FROM hash_talk.content_usage WHERE singleton'])
    if actual.strip() != b't':
        raise RuntimeError('Community initial tables/actual-use ledger inconsistent.')


def verify_calls_migration(candidate, before):
    import deploy_blocks45 as backups
    after, versions = calls_snapshot(), attachment_versions(candidate)
    if before['versions'] != versions[:25] or after['versions'] != versions or after['tables'] != before['tables']:
        raise RuntimeError('Calls/push migration/data preservation failed.')
    total = content_total()
    for table in ('personal_removals',) + DAILY_NEW_TABLES + GROUPS_NEW_TABLES + REPRESENTATIVES_NEW_TABLES + CALLS_NEW_TABLES:
        total += ' + coalesce((SELECT sum(charge) FROM hash_talk.' + table + '),0)'
    empty = ' AND '.join('NOT EXISTS(SELECT 1 FROM hash_talk.' + table + ')' for table in CALLS_NEW_TABLES)
    actual = backups.pg(['psql', '--no-psqlrc', '--set=ON_ERROR_STOP=1', '--tuples-only', '--no-align', '-c',
        'SELECT used_bytes=(' + total + ') AND ' + empty +
        ' FROM hash_talk.content_usage WHERE singleton'])
    if actual.strip() != b't':
        raise RuntimeError('Calls/push initial tables/actual-use ledger inconsistent.')


def verify_representatives_migration(candidate, before):
    import deploy_blocks45 as backups
    after, versions = representatives_snapshot(), attachment_versions(candidate)
    if before['versions'] != versions[:24] or after['versions'] != versions or after['tables'] != before['tables']:
        raise RuntimeError('Block 12A migration/data preservation failed.')
    total = content_total()
    for table in ('personal_removals',) + DAILY_NEW_TABLES + GROUPS_NEW_TABLES + REPRESENTATIVES_NEW_TABLES:
        total += ' + coalesce((SELECT sum(charge) FROM hash_talk.' + table + '),0)'
    empty = ' AND '.join('NOT EXISTS(SELECT 1 FROM hash_talk.' + table + ')' for table in REPRESENTATIVES_NEW_TABLES)
    actual = backups.pg(['psql', '--no-psqlrc', '--set=ON_ERROR_STOP=1', '--tuples-only', '--no-align', '-c',
        'SELECT used_bytes=(' + total + ') AND ' + empty +
        ' FROM hash_talk.content_usage WHERE singleton'])
    if actual.strip() != b't':
        raise RuntimeError('Block 12A initial tables/actual-use ledger inconsistent.')


def verify_groups_migration(candidate, before):
    import deploy_blocks45 as backups
    after, versions = groups_snapshot(), attachment_versions(candidate)
    if before['versions'] != versions[:19] or after['versions'] != versions or after['tables'] != before['tables']:
        raise RuntimeError('Block 11 migration/data preservation failed.')
    total = content_total()
    for table in ('personal_removals',) + DAILY_NEW_TABLES + GROUPS_NEW_TABLES:
        total += ' + coalesce((SELECT sum(charge) FROM hash_talk.' + table + '),0)'
    empty = ' AND '.join('NOT EXISTS(SELECT 1 FROM hash_talk.' + table + ')' for table in GROUPS_NEW_TABLES)
    actual = backups.pg(['psql', '--no-psqlrc', '--set=ON_ERROR_STOP=1', '--tuples-only', '--no-align', '-c',
        'SELECT used_bytes=(' + total + ') AND ' + empty +
        ' FROM hash_talk.content_usage WHERE singleton'])
    if actual.strip() != b't':
        raise RuntimeError('Block 11 initial tables/actual-use ledger inconsistent.')


def linked_snapshot():
    import deploy_blocks45 as backups
    return backups.database_snapshot(LINKED_TABLES,
        omit_columns={'login_sessions':('wallet_confirmed',)})


def verify_linked_migration(candidate, before):
    import deploy_blocks45 as backups
    after, versions = linked_snapshot(), attachment_versions(candidate)
    if before['versions'] != versions[:18] or after['versions'] != versions or after['tables'] != before['tables']:
        raise RuntimeError('Linked-session migration/data preservation failed.')
    # The prior release could only issue sessions after verifying the wallet.
    # All other row fields and the quota ledger are covered by the full snapshot.
    actual = backups.pg(['psql', '--no-psqlrc', '--set=ON_ERROR_STOP=1', '--tuples-only', '--no-align', '-c',
        'SELECT NOT EXISTS(SELECT 1 FROM hash_talk.login_sessions WHERE NOT wallet_confirmed)'])
    if actual.strip() != b't':
        raise RuntimeError('Existing wallet sessions were not preserved as confirmed.')


def daily_snapshot():
    import deploy_blocks45 as backups
    return backups.database_snapshot(DAILY_TABLES,
        omit_columns={'message_packets':('relation', 'deletion_account')})


def verify_daily_migration(candidate, before):
    import deploy_blocks45 as backups
    after, versions = daily_snapshot(), attachment_versions(candidate)
    if before['versions'] != versions[:17] or after['versions'] != versions or after['tables'] != before['tables']:
        raise RuntimeError('Block 10 migration/data preservation failed.')
    total = content_total() + ' + coalesce((SELECT sum(charge) FROM hash_talk.personal_removals),0)'
    for table in DAILY_NEW_TABLES:
        total += ' + coalesce((SELECT sum(charge) FROM hash_talk.' + table + '),0)'
    empty = ' AND '.join('NOT EXISTS(SELECT 1 FROM hash_talk.' + t + ')' for t in DAILY_NEW_TABLES)
    actual = backups.pg(['psql', '--no-psqlrc', '--set=ON_ERROR_STOP=1', '--tuples-only', '--no-align', '-c',
        'SELECT used_bytes=(' + total + ') AND ' + empty +
        ' AND NOT EXISTS(SELECT 1 FROM hash_talk.message_packets WHERE relation IS NOT NULL OR deletion_account IS NOT NULL) '
        'FROM hash_talk.content_usage WHERE singleton'])
    if actual.strip() != b't':
        raise RuntimeError('Block 10 initial operational state/actual-use ledger inconsistent.')


def attachment_snapshot():
    import deploy_blocks45 as backups
    return backups.database_snapshot(ATTACHMENT_TABLES)


def backup_snapshot():
    import deploy_blocks45 as backups
    # This new field did not exist in 016. All existing row fields remain bound
    # to the digest; verify_backup_migration separately requires it to be false.
    return backups.database_snapshot(BACKUP_TABLES,
                                     omit_columns={'message_packets':('personal_collected',)})


def attachment_versions(candidate):
    return [{'version':i + 1, 'checksum':digest(path)} for i, path in
            enumerate(sorted((candidate / 'src/server/database/migrations').glob('*.sql')))]


def verify_attachment_migration(candidate, before):
    import deploy_blocks45 as backups
    after = attachment_snapshot()
    versions = attachment_versions(candidate)
    if before['versions'] != versions[:15] or after['versions'] != versions or after['tables'] != before['tables']:
        raise RuntimeError('Block 08 migration/data preservation failed.')
    total = content_total()
    actual = backups.pg(['psql', '--no-psqlrc', '--set=ON_ERROR_STOP=1', '--tuples-only', '--no-align', '-c',
                         'SELECT used_bytes=(' + total + ') AND NOT EXISTS(SELECT 1 FROM hash_talk.message_attachments) '
                         'FROM hash_talk.content_usage WHERE singleton'])
    if actual.strip() != b't':
        raise RuntimeError('Block 08 attachment table/actual-use ledger inconsistent.')


def content_total():
    total = 'coalesce((SELECT sum(octet_length(profile_ciphertext)+524) FROM hash_talk.accounts),0)'
    for table in ['vault_operations', 'message_recovery_keys', 'message_packets',
                  'matrix_devices', 'matrix_one_time_keys', 'matrix_envelopes', 'message_attachments']:
        total += ' + coalesce((SELECT sum(charge) FROM hash_talk.' + table + '),0)'
    return total


def verify_backup_migration(candidate, before):
    import deploy_blocks45 as backups
    after, versions = backup_snapshot(), attachment_versions(candidate)
    if before['versions'] != versions[:16] or after['versions'] != versions or after['tables'] != before['tables']:
        raise RuntimeError('Block 09 migration/data preservation failed.')
    total = content_total() + ' + coalesce((SELECT sum(charge) FROM hash_talk.personal_removals),0)'
    actual = backups.pg(['psql', '--no-psqlrc', '--set=ON_ERROR_STOP=1', '--tuples-only', '--no-align', '-c',
        'SELECT used_bytes=(' + total + ') AND NOT EXISTS(SELECT 1 FROM hash_talk.personal_removals) '
        'AND NOT EXISTS(SELECT 1 FROM hash_talk.message_packets WHERE personal_collected) '
        'FROM hash_talk.content_usage WHERE singleton'])
    if actual.strip() != b't':
        raise RuntimeError('Block 09 initial cleanup state/actual-use ledger inconsistent.')


def preflight(config):
    validate(config)
    preservation(config['baseline'])
    if run(['findmnt', '-n', '-o', 'TARGET', '--target', str(DATA)]).decode().strip() != str(DATA):
        raise RuntimeError('Own bounded filesystem absent.')
    live = DATA / 'release'
    if not live.is_dir() or live.is_symlink():
        raise RuntimeError('Unexpected own release path.')
    stats = os.statvfs(DATA)
    if stats.f_bavail * stats.f_frsize < 2 * MAX_RELEASE:
        raise RuntimeError('Insufficient own bounded disk space.')
    actual = run(['git', '--git-dir=' + str(DATA / 'git/0xdmme.git'),
                  'rev-parse', 'refs/heads/' + config['branch']]).decode().strip()
    if actual != config['commit']:
        raise RuntimeError('VPS Git revision mismatch.')
    healthy()
    if (DATA / 'background-units').exists():
        import deploy_background
        deploy_background.verify_current(config)
        if not deploy_background.ready():
            raise RuntimeError('Own workers not ready; refusing maintenance.')
    return own_state()


def prepare(config, work):
    blob = run(['git', '--git-dir=' + str(DATA / 'git/0xdmme.git'), 'archive',
                config['commit'], 'src', 'infra', 'package.json', 'package-lock.json', '.nvmrc'])
    candidate = work / 'candidate'
    candidate.mkdir(mode=0o755)
    with tarfile.open(fileobj=io.BytesIO(blob)) as archive:
        extract(archive, candidate, ['src', 'infra', 'package.json', 'package-lock.json', '.nvmrc'])
    with tarfile.open(work / 'build.tar.gz') as archive:
        extract(archive, candidate, ['dist'])
    with measured('corresponding_sources'):
        public_sources.reconstruct(config, candidate, DATA / 'git/0xdmme.git')
    with measured('candidate_hashes'):
        actual = {str(p.relative_to(candidate)): digest(p) for p in candidate.rglob('*') if p.is_file()}
    if actual != config['files']:
        raise RuntimeError('Git source/build manifest mismatch.')
    compatibility(candidate, DATA / 'release')
    dependencies = DATA / 'release/node_modules'
    count, size = 0, sum(p.stat().st_size for p in candidate.rglob('*') if p.is_file())
    for path in dependencies.rglob('*'):
        count += 1
        if path.is_symlink() and not path.resolve().is_relative_to(dependencies):
            raise RuntimeError('Runtime dependency link escapes its directory.')
        if path.is_file():
            size += path.stat().st_size
        if count > 4096 or size > MAX_RELEASE:
            raise RuntimeError('Runtime dependency budget exceeded.')
    with measured('runtime_copy'):
        shutil.copytree(dependencies, candidate / 'node_modules', symlinks=True)
    with measured('runtime_install'):
        runtime.install(candidate)
    if (candidate / 'dist/runtime').exists():
        run(['/usr/bin/node', '-e',
             "const p=require(process.argv[1]); if(typeof p.sendNotification!=='function') process.exit(1);",
             str(candidate / 'node_modules/web-push')])
    if (sum(p.stat().st_size for p in candidate.rglob('*') if p.is_file()) > MAX_RELEASE
            or sum(1 for _ in (candidate / 'node_modules').rglob('*')) > 4096):
        raise RuntimeError('Combined runtime release budget exceeded.')
    for path in [candidate, *candidate.rglob('*')]:
        if path.is_symlink():
            os.lchown(path, 0, 0)
            continue
        os.chown(path, 0, 0)
        os.chmod(path, 0o755 if path.is_dir() or path.stat().st_mode & 0o111 else 0o644)
    # Still in preparation: a refusal here leaves the web unit and workers untouched.
    with measured('moderation_preflight'):
        moderation_preflight(candidate)
    return candidate


MODERATION_ENVIRONMENT = re.compile(r'HASH_TALK_(?:MODERATION|MEDIA)_[A-Z0-9_]+')
MODERATION_PREFLIGHT = """
import { pathToFileURL } from 'node:url';
const root = process.argv[1];
const { readPoseModerationConfiguration } = await import(
  pathToFileURL(root + '/src/server/public-moderation/configuration.ts').href);
try {
  await readPoseModerationConfiguration(process.env);
} catch (error) {
  process.stdout.write(String(error?.message ?? 'unknown').slice(0, 200));
  process.exitCode = 3;
}
"""


def unit_moderation_environment(unit=UNIT):
    """Only moderation/media settings of the unit; database and other secrets never leave it."""
    values = {}
    files = run(['systemctl', 'show', unit, '-p', 'EnvironmentFiles', '--value']).decode()
    for line in files.splitlines():
        path = Path(line.split(' (', 1)[0].strip().lstrip('-'))
        if not line.strip() or not path.is_file():
            continue
        for entry in path.read_text().splitlines():
            key, separator, value = entry.strip().partition('=')
            if separator and MODERATION_ENVIRONMENT.fullmatch(key):
                values[key] = value.strip().strip('"').strip("'")
    assignments = run(['systemctl', 'show', unit, '-p', 'Environment', '--value']).decode()
    for entry in shlex.split(assignments):
        key, separator, value = entry.partition('=')
        if separator and MODERATION_ENVIRONMENT.fullmatch(key):
            values[key] = value
    return values


def moderation_preflight(candidate):
    """Refuse before any unit stops when the candidate would reject its moderation approvals."""
    # Like the runtime check in prepare(), this reads the root-owned candidate; only
    # moderation/media settings and a fixed PATH reach the process.
    environment = dict(unit_moderation_environment(), PATH='/usr/bin:/bin')
    try:
        run(['/usr/bin/node', '--input-type=module', '-e', MODERATION_PREFLIGHT, str(candidate)],
            timeout=60, env=environment)
    except subprocess.CalledProcessError as error:
        output = (error.stdout or b'').decode(errors='replace').strip()
        lines = [line for line in (error.stderr or b'').decode(errors='replace').splitlines()
                 if 'Error' in line]
        reason = output or (lines[-1].strip()[:200] if lines else 'no reason')
        raise RuntimeError('Candidate refuses the moderation configuration: ' + reason) from None


class ActivationFailed(RuntimeError):
    def __init__(self, rollback_verified):
        super().__init__('Activation failed; rollback verified.' if rollback_verified
                         else 'Activation failed; rollback could not be verified.')
        self.rollback_verified = rollback_verified


def exchange(candidate, previous, verify):
    """Only the own web unit is restarted. Restore files and web on any failure."""
    live = DATA / 'release'
    live.rename(previous)
    installed = False
    try:
        candidate.rename(live)
        installed = True
        run(['systemctl', 'restart', UNIT])
        verify()
    except BaseException:
        try:
            if installed:
                live.rename(candidate)
            previous.rename(live)
            # A failing candidate can exhaust the unit's start limit; the rollback must still start.
            run(['systemctl', 'reset-failed', UNIT])
            run(['systemctl', 'restart', UNIT])
            wait_ready()
        except BaseException:
            raise ActivationFailed(False) from None
        raise ActivationFailed(True) from None


def activate_attachments(config, work, candidate, before_state):
    """Reviewed 015→016 transition; reuse existing private backup/restore tools."""
    return activate_database(config, work, candidate, {'before_state':before_state,
        'review':attachment_review, 'snapshot':attachment_snapshot, 'versions':15,
        'verify':verify_attachment_migration})


def activate_backups(config, work, candidate, before_state):
    """Reviewed 016→017 transition; same maintenance and rollback contract."""
    return activate_database(config, work, candidate, {'before_state':before_state,
        'review':backup_review, 'snapshot':backup_snapshot, 'versions':16,
        'verify':verify_backup_migration})


def activate_daily(config, work, candidate, before_state):
    """Reviewed 017→018 and original npm packages, same maintenance contract."""
    return activate_database(config, work, candidate, {'before_state':before_state,
        'review':daily_review, 'snapshot':daily_snapshot, 'versions':17,
        'verify':verify_daily_migration})


def activate_linked(config, work, candidate, before_state):
    """Reviewed 018→019; preserve all existing data and the maintenance contract."""
    return activate_database(config, work, candidate, {'before_state':before_state,
        'review':linked_review, 'snapshot':linked_snapshot, 'versions':18,
        'verify':verify_linked_migration})


def activate_groups(config, work, candidate, before_state):
    """Reviewed 019→024, unchanged dependencies and existing backup/return contract."""
    return activate_database(config, work, candidate, {'before_state':before_state,
        'review':groups_review, 'snapshot':groups_snapshot, 'versions':19,
        'verify':verify_groups_migration})


def activate_representatives(config, work, candidate, before_state):
    """Reviewed 024→025; reuse the existing private backup and return contract."""
    return activate_database(config, work, candidate, {'before_state':before_state,
        'review':representatives_review, 'snapshot':representatives_snapshot, 'versions':24,
        'verify':verify_representatives_migration})


def activate_calls(config, work, candidate, before_state):
    """Reviewed 025→027; preserve existing rows, objects and restore contract."""
    return activate_database(config, work, candidate, {'before_state':before_state,
        'review':calls_review, 'snapshot':calls_snapshot, 'versions':25,
        'verify':verify_calls_migration})


def activate_communities(config, work, candidate, before_state):
    """Reviewed 027→043; retain all existing data and keep new public tables empty."""
    return activate_database(config, work, candidate, {'before_state':before_state,
        'review':communities_review, 'snapshot':communities_snapshot, 'versions':27,
        'verify':verify_communities_migration})


def transition_failure(phase, error):
    failure = {'phase': phase, 'type': type(error).__name__}
    if isinstance(error, RuntimeError):
        failure['reason'] = str(error)[:256]
    if isinstance(error, subprocess.SubprocessError):
        failure['timeout'] = isinstance(error, subprocess.TimeoutExpired)
    if isinstance(error, subprocess.CalledProcessError):
        failure['exit_code'] = error.returncode
        raw = (error.stderr or b'')[-65536:]
        detail = (raw.decode(errors='replace') if isinstance(raw, bytes) else raw).lower()
        for text, category in [
            ('statement timeout', 'statement-timeout'),
            ('lock timeout', 'lock-timeout'),
            ('idle-in-transaction timeout', 'idle-transaction-timeout'),
            ('err_module_not_found', 'runtime-dependency'),
            ('heap out of memory', 'node-heap'),
            ('read-only file system', 'read-only-filesystem'),
        ]:
            if text in detail:
                failure['category'] = category
                break
    return failure


def activate_database(config, work, candidate, transition):
    import deploy_blocks45 as backups
    snapshot, before_state = transition['snapshot'], transition['before_state']
    transition['review'](candidate, DATA / 'release')
    if snapshot()['versions'] != attachment_versions(candidate)[:transition['versions']]:
        raise RuntimeError('Live schema differs from the reviewed predecessor.')
    if backups.own_free_bytes() < backups.required_backup_space():
        raise RuntimeError('Insufficient disk budget for private backups.')
    receipt(work, {'status':'maintenance', 'commit':config['commit']})
    opened = installed = False
    infrastructure_touched = False
    expected_state = before_state
    before = objects = checksum = None
    live, previous = DATA / 'release', work / 'previous'
    phase = 'stopping'
    try:
        if transition.get('stop_existing'):
            transition['stop_existing']()
        if transition.get('stop') and infrastructure_touched:
            transition['stop']()
        run(['systemctl', 'stop', UNIT])
        if run(['systemctl', 'show', UNIT, '--property=MainPID', '--value']).strip() != b'0':
            raise RuntimeError('Own writer did not stop.')
        phase = 'backup'
        before, objects = snapshot(), backups.objects_snapshot()
        checksum = backups.backup(work)
        if backups.file_tree(work / 'objects-backup') != objects:
            raise RuntimeError('Object backup verification failed.')
        backups.validate_restore(work, before, checksum, snapshot=snapshot)
        receipt(work, {'status':'backed-up', 'commit':config['commit'], 'backup_sha256':checksum})
        phase = 'migration'
        backups.migrate(candidate)
        phase = 'verifying-migration'
        transition['verify'](candidate, before)
        if backups.objects_snapshot() != objects:
            raise RuntimeError('Existing objects changed during migration.')
        preservation(config['baseline'])
        if own_state() != before_state:
            raise RuntimeError('Configuration/database process changed.')
        phase = 'exchanging-release'
        live.rename(previous)
        candidate.rename(live)
        installed = True
        if transition.get('install'):
            phase = 'installing-workers'
            infrastructure_touched = True
            expected_state = transition['install']()
        receipt(work, {'status':'opening', 'commit':config['commit'], 'backup_sha256':checksum})
        # New writes may exist after this point; never automatically restore old data.
        opened = True
        phase = 'opening-web'
        run(['systemctl', 'start', UNIT])
        wait_ready(config['files'])
        if transition.get('start'):
            phase = 'starting-workers'
            transition['start']()
        phase = 'preservation'
        preservation(config['baseline'])
        if own_state() != expected_state:
            raise RuntimeError('Configuration/database process changed.')
    except BaseException as error:
        failure = transition_failure(phase, error)
        # Only phase/type and our controlled guard messages: never SQL, argv,
        # database credentials or content. stderr is captured privately by deploy.py.
        print(json.dumps({'transition_failure': failure}), file=sys.stderr, flush=True)
        rollback = False
        try:
            if infrastructure_touched and transition.get('stop'):
                transition['stop']()
            run(['systemctl', 'stop', UNIT])
            if transition.get('stop_existing'):
                transition['stop_existing']()
            if not opened:
                if checksum is not None and before is not None and snapshot() != before:
                    backups.restore(work, before, checksum, snapshot=snapshot)
                if before is not None and snapshot() != before:
                    raise RuntimeError('Pre-opening database return failed.')
                if installed:
                    live.rename(candidate)
                if previous.exists():
                    previous.rename(live)
                if infrastructure_touched and transition.get('uninstall'):
                    transition['uninstall']()
                run(['systemctl', 'start', UNIT])
                wait_ready()
                if transition.get('resume_existing'):
                    transition['resume_existing']()
                preservation(config['baseline'])
                rollback = own_state() == before_state
        except BaseException:
            rollback = False
        receipt(work, {'status':'failed', 'commit':config['commit'],
                       'rollback_verified':rollback, 'new_state_preserved':opened,
                       'failure':failure, 'backup_sha256':checksum})
        raise RuntimeError('Transition failed; old release returned.' if rollback else
                           'Transition failed; own service stopped and state retained for review.') from None
    result = {'status':'published', 'commit':config['commit'], 'migrations_verified':True,
              'public_build_verified':True, 'preservation_checks_passed':True,
              'private_backup_retained':True, 'shared_services_restarted':False}
    if transition.get('start'):
        result['independent_workers_verified'] = True
    receipt(work, result)
    return result


def activate(config, work):
    with measured('preflight'):
        before = preflight(config)
    if not work.is_dir() or work.is_symlink() or (work / 'result.json').exists():
        raise RuntimeError('Deployment workspace unavailable/already used.')
    if digest(work / 'build.tar.gz') != config['archive_sha256']:
        raise RuntimeError('Uploaded archive changed.')
    receipt(work, {'status': 'preparing', 'commit': config['commit']})
    try:
        with measured('prepare'):
            candidate = prepare(config, work)
    except BaseException:
        verified = False
        workers_ready = False
        try:
            preservation(config['baseline'])
            healthy()
            verified = own_state() == before
            if verified:
                if (DATA / 'background-units').exists():
                    import deploy_background
                    workers_ready = deploy_background.ready()
                else:
                    workers_ready = True
        finally:
            receipt(work, {'status': 'failed', 'commit': config['commit'], 'code_only': True,
                           'phase': 'prepare', 'rollback_verified': verified, 'workers_ready': workers_ready})
        raise
    preservation(config['baseline'])
    if own_state() != before:
        raise RuntimeError('Own configuration/database service changed.')
    if (database_files(candidate) != database_files(DATA / 'release')
            and not database_code_reviewed(candidate, DATA / 'release')):
        # Any unreviewed database change was rejected by prepare()/compatibility().
        if len(list((candidate / 'src/server/database/migrations').glob('*.sql'))) == 102:
            import deploy_engagement
            return deploy_engagement.activate(config, work, candidate, before)
        if len(list((candidate / 'src/server/database/migrations').glob('*.sql'))) == 99:
            import deploy_post_share_counts
            return deploy_post_share_counts.activate(config, work, candidate, before)
        if len(list((candidate / 'src/server/database/migrations').glob('*.sql'))) == 98:
            import deploy_group_fences
            return deploy_group_fences.activate(config, work, candidate, before)
        if len(list((candidate / 'src/server/database/migrations').glob('*.sql'))) == 97:
            import deploy_community_games
            return deploy_community_games.activate(config, work, candidate, before)
        if len(list((candidate / 'src/server/database/migrations').glob('*.sql'))) == 96:
            import deploy_message_sync
            return deploy_message_sync.activate(config, work, candidate, before)
        if len(list((candidate / 'src/server/database/migrations').glob('*.sql'))) == 95:
            import deploy_post_search
            return deploy_post_search.activate(config, work, candidate, before)
        if len(list((candidate / 'src/server/database/migrations').glob('*.sql'))) == 94:
            import deploy_contact_invitations
            return deploy_contact_invitations.activate(config, work, candidate, before)
        if len(list((candidate / 'src/server/database/migrations').glob('*.sql'))) == 93:
            import deploy_profile_directory
            return deploy_profile_directory.activate(config, work, candidate, before)
        if len(list((candidate / 'src/server/database/migrations').glob('*.sql'))) == 92:
            import deploy_account_rankings
            return deploy_account_rankings.activate(config, work, candidate, before)
        if len(list((candidate / 'src/server/database/migrations').glob('*.sql'))) == 91:
            import deploy_group_media_parts
            return deploy_group_media_parts.activate(config, work, candidate, before)
        if len(list((candidate / 'src/server/database/migrations').glob('*.sql'))) == 90:
            import deploy_capacity_database
            return deploy_capacity_database.activate(config, work, candidate, before)
        if len(list((candidate / 'src/server/database/migrations').glob('*.sql'))) == 72:
            import deploy_community_addresses
            return deploy_community_addresses.activate(config, work, candidate, before)
        if len(list((candidate / 'src/server/database/migrations').glob('*.sql'))) == 71:
            import deploy_chat_attachments
            return deploy_chat_attachments.activate(config, work, candidate, before)
        if len(list((candidate / 'src/server/database/migrations').glob('*.sql'))) == 70:
            import deploy_ranking_activity
            return deploy_ranking_activity.activate(config, work, candidate, before)
        if len(list((candidate / 'src/server/database/migrations').glob('*.sql'))) == 69:
            import deploy_social_reactions
            return deploy_social_reactions.activate(config, work, candidate, before)
        if len(list((candidate / 'src/server/database/migrations').glob('*.sql'))) == 68:
            import deploy_public_upvotes
            return deploy_public_upvotes.activate(config, work, candidate, before)
        if len(list((candidate / 'src/server/database/migrations').glob('*.sql'))) == 67:
            import deploy_community_classification
            return deploy_community_classification.activate(config, work, candidate, before)
        if len(list((candidate / 'src/server/database/migrations').glob('*.sql'))) == 66:
            import deploy_message_changes
            return deploy_message_changes.activate(config, work, candidate, before)
        if len(list((candidate / 'src/server/database/migrations').glob('*.sql'))) == 64:
            import deploy_mentions
            return deploy_mentions.activate(config, work, candidate, before)
        if len(list((candidate / 'src/server/database/migrations').glob('*.sql'))) == 62:
            import deploy_discussion
            return deploy_discussion.activate(config, work, candidate, before)
        if len(list((candidate / 'src/server/database/migrations').glob('*.sql'))) == 61:
            import deploy_social_experience
            return deploy_social_experience.activate(config, work, candidate, before)
        if len(list((candidate / 'src/server/database/migrations').glob('*.sql'))) == 58:
            import deploy_social_controls
            return deploy_social_controls.activate(config, work, candidate, before)
        if len(list((candidate / 'src/server/database/migrations').glob('*.sql'))) == 55:
            import deploy_post_tags
            return deploy_post_tags.activate(config, work, candidate, before)
        if len(list((candidate / 'src/server/database/migrations').glob('*.sql'))) == 54:
            import deploy_group_links
            return deploy_group_links.activate(config, work, candidate, before)
        if len(list((candidate / 'src/server/database/migrations').glob('*.sql'))) == 53:
            import deploy_profile_description
            return deploy_profile_description.activate(config, work, candidate, before)
        if len(list((candidate / 'src/server/database/migrations').glob('*.sql'))) == 52:
            import deploy_profile_social
            return deploy_profile_social.activate(config, work, candidate, before)
        if len(list((candidate / 'src/server/database/migrations').glob('*.sql'))) == 49:
            import deploy_background
            return deploy_background.activate(config, work, candidate, before)
        if len(list((candidate / 'src/server/database/migrations').glob('*.sql'))) == 43:
            return activate_communities(config, work, candidate, before)
        if len(list((candidate / 'src/server/database/migrations').glob('*.sql'))) == 27:
            return activate_calls(config, work, candidate, before)
        if len(list((candidate / 'src/server/database/migrations').glob('*.sql'))) == 25:
            return activate_representatives(config, work, candidate, before)
        if len(list((candidate / 'src/server/database/migrations').glob('*.sql'))) == 24:
            return activate_groups(config, work, candidate, before)
        if len(list((candidate / 'src/server/database/migrations').glob('*.sql'))) == 19:
            return activate_linked(config, work, candidate, before)
        if len(list((candidate / 'src/server/database/migrations').glob('*.sql'))) == 18:
            return activate_daily(config, work, candidate, before)
        if len(list((candidate / 'src/server/database/migrations').glob('*.sql'))) == 17:
            return activate_backups(config, work, candidate, before)
        return activate_attachments(config, work, candidate, before)
    # Interrupted processes leave an explicit receipt; never blindly retry them.
    receipt(work, {'status': 'activating', 'commit': config['commit']})
    background = None
    if (DATA / 'background-units').exists():
        import deploy_background as background
    def verify():
        with measured('public_readiness'):
            wait_ready(config['files'])
        if background:
            with measured('workers_start'):
                background.start()
        preservation(config['baseline'])
        if own_state() != before:
            raise RuntimeError('Own configuration/database service changed.')
    try:
        if background:
            background.verify_current(config)
            background.stop()
        with measured('exchange_and_verify'):
            exchange(candidate, work / 'previous', verify)
    except BaseException as error:
        rolled_back = isinstance(error, ActivationFailed) and error.rollback_verified
        workers_ready = not background
        try:
            if background:
                background.stop()
                if rolled_back:
                    background.start()
                    workers_ready = True
        finally:
            receipt(work, {'status': 'failed', 'commit': config['commit'], 'code_only': True,
                           'rollback_verified': rolled_back, 'workers_ready': workers_ready})
        raise
    result = {'status': 'published', 'commit': config['commit'],
              'public_build_verified': True, 'preservation_checks_passed': True,
              'rollback_release_retained': True, 'shared_services_restarted': False}
    receipt(work, result)
    prune_completed(work)
    return result


def main():
    raw = sys.stdin.buffer.read(24 * 1024 * 1024 + 1)
    if len(raw) > 24 * 1024 * 1024:
        raise RuntimeError('Deployment input exceeded budget.')
    config = json.loads(raw)
    validate(config)
    if 'request_limit' in config:
        import deploy_request_limit as request_limits
        request_limits.reviewed_path(config['request_limit'])
    if 'worker_boot' in config:
        import deploy_worker_boot
        deploy_worker_boot.review(config)
    action = sys.argv[1]
    work = DATA / ('deployment-' + config['commit'])
    if 'media_worker' in config:
        import deploy_media_worker
        deploy_media_worker.validate_current(config)
    if action == 'check':
        with measured('preflight'):
            preflight(config)
        marker = work / 'result.json'
        if marker.is_file() and not marker.is_symlink():
            state = json.loads(marker.read_text())
            if state.get('status') == 'published' and state.get('commit') == config['commit']:
                current = all((DATA / 'release' / name).is_file() and
                              digest(DATA / 'release' / name) == expected
                              for name, expected in config['files'].items())
                if current:
                    healthy(config['files'])
                    if 'src/server/worker.ts' in config['files']:
                        import deploy_background
                        deploy_background.verify_current(config)
                        if not deploy_background.ready():
                            raise RuntimeError('Previously published background workers are not ready.')
                    return {'preflight_passed': True, 'already_active': True, 'commit': config['commit']}
        retention_capacity(work)
        return {'preflight_passed': True, 'activated': False}
    if action not in ['receive', 'activate', 'requests', 'worker-boot']:
        raise RuntimeError('Invalid deployment action.')
    fd = os.open(DATA / 'deployment.lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if action != 'activate':
            with measured('preflight'):
                preflight(config)
        if action == 'worker-boot':
            import deploy_worker_boot
            return deploy_worker_boot.published(config, work)
        if action == 'requests':
            import deploy_request_limit as request_limits
            if 'request_limit' not in config:
                raise RuntimeError('Request-limit approval absent.')
            marker = work / 'result.json'
            if work.is_symlink() or marker.is_symlink() or not marker.is_file():
                raise RuntimeError('Code must be published before changing the request limit.')
            state = json.loads(marker.read_text())
            if state.get('status') != 'published' or state.get('commit') != config['commit']:
                raise RuntimeError('Request-limit activation requires the exact published commit.')
            if any(not (DATA / 'release' / name).is_file() or
                   digest(DATA / 'release' / name) != checksum
                   for name, checksum in config['files'].items()):
                raise RuntimeError('Active release differs from request-limit review.')
            # Keep operational evidence outside code workspaces so their existing
            # retention/rollback contract remains unchanged on later releases.
            return request_limits.change(config, DATA / 'request-limit-20261008')
        if action == 'receive':
            archive = base64.b64decode(config['archive'], validate=True)
            if len(archive) != config['archive_bytes'] or hashlib.sha256(archive).hexdigest() != config['archive_sha256']:
                raise RuntimeError('Upload size/digest mismatch.')
            # At most three attempts/rollback copies. Never erase older releases implicitly.
            prune_completed(work)
            if len(list(DATA.glob('deployment-*'))) >= 3:
                raise RuntimeError('Deployment retention budget reached; review own old artifacts.')
            work.mkdir(mode=0o700)
            with (work / 'build.tar.gz').open('xb') as handle:
                handle.write(archive)
            return {'uploaded': True, 'activated': False}
        if 'media_worker' in config:
            import deploy_media_worker
            with deploy_media_worker.activation(config, work) as media_proof:
                result = activate(config, work)
            return dict(result, media_worker=media_proof)
        return activate(config, work)


def execute():
    MEASUREMENTS.clear()
    try:
        with measured('total'):
            result = main()
    except BaseException as error:
        print(json.dumps({'deployment_failure': transition_failure('execution', error),
                          'timings': MEASUREMENTS}), file=sys.stderr, flush=True)
        raise
    return dict(result, timings=MEASUREMENTS)


if __name__ == '__main__':
    try:
        print(json.dumps(execute()))
    except Exception as error:
        print(json.dumps({'deployment_failed': True, 'error_type': type(error).__name__,
                          'message': str(error) if isinstance(error, RuntimeError)
                          else 'Private deployment error; inspect the local log.'}))
        raise SystemExit(1)
