"""Bounded release activation. Access/inventory arrive through private stdin."""

import base64
import fcntl
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import sys
import tarfile
import time

import deploy_sources as public_sources

DATA = Path('/var/lib/0xdmme/data')
UNIT = '0xdmme-test.service'
ORIGIN = 'https://0xdmme.app'
MAX_ARCHIVE = 16 * 1024 * 1024
MAX_RELEASE = 128 * 1024 * 1024
# Owner-reviewed dev-only NaCl transition, including rollback. Never a general
# allowance for dev dependencies; every other changed lock remains blocked.
PHANTOM_PROBE_LOCKFILES = frozenset([
    '4db68588987a5b5a1a3afedd09a6096a2c5ab51c37ac9f334af2cc06b8125092',
    'fac024d2596d80a4450f9ad46cc212e6b51e536f02062f630fd8c8c1adcc0be5',
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


def run(args, timeout=30):
    return subprocess.run(args, check=True, capture_output=True, timeout=timeout).stdout


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def validate(config):
    if not re.fullmatch(r'[a-f0-9]{40}', config['commit']):
        raise RuntimeError('Invalid commit.')
    if not re.fullmatch(r'codex/[A-Za-z0-9][A-Za-z0-9._/-]*', config['branch']):
        raise RuntimeError('Invalid branch.')
    files = config['files']
    if not 1 <= len(files) <= 512:
        raise RuntimeError('Invalid release manifest size.')
    for name, value in files.items():
        parts = PurePosixPath(name).parts
        if (not parts or name.startswith('/') or '..' in parts or
                str(PurePosixPath(name)) != name or
                parts[0] not in ['src', 'infra', 'dist', 'package.json', 'package-lock.json', '.nvmrc'] or
                not re.fullmatch(r'[a-f0-9]{64}', value)):
            raise RuntimeError('Invalid release manifest path/digest.')
    if not 0 < config['archive_bytes'] <= MAX_ARCHIVE:
        raise RuntimeError('Archive budget exceeded.')
    if not re.fullmatch(r'[a-f0-9]{64}', config['archive_sha256']):
        raise RuntimeError('Invalid archive digest.')
    if not re.fullmatch(r'/app-[a-f0-9]{16}\.js', config['script']):
        raise RuntimeError('Invalid public script.')
    if 'dist/web' + config['script'] not in files:
        raise RuntimeError('Public script absent from manifest.')
    public_sources.validate(config)


def extract(archive, destination, allowed):
    members = archive.getmembers()
    if len(members) > 4096 or sum(m.size for m in members) > MAX_RELEASE:
        raise RuntimeError('Extraction budget exceeded.')
    names = set()
    for member in members:
        parts = PurePosixPath(member.name).parts
        if (not parts or member.name.startswith('/') or '..' in parts or
                parts[0] not in allowed or member.name in names or
                not (member.isfile() or member.isdir())):
            raise RuntimeError('Unsafe archive member.')
        names.add(member.name)
    archive.extractall(destination, filter='data')


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
    for attempt in range(10):
        try:
            healthy(files)
            return
        except (RuntimeError, subprocess.SubprocessError):
            if attempt == 9:
                raise RuntimeError('Own service did not become ready.') from None
            time.sleep(1)


def reviewed_lockfile_change(before, after):
    if frozenset([digest(before), digest(after)]) != PHANTOM_PROBE_LOCKFILES:
        return False
    # Recheck the runtime closure even for the exact reviewed hash pair.
    def runtime_entries(path):
        packages = json.loads(path.read_text())['packages']
        return {name: value for name, value in packages.items()
                if name and value.get('dev') is not True}
    return runtime_entries(before) == runtime_entries(after)


def database_files(root):
    directory = root / 'src/server/database'
    return {str(p.relative_to(directory)): digest(p) for p in directory.rglob('*') if p.is_file()}


def compatibility(candidate, live):
    # Startup calls migrate(); guard both SQL and the code that executes it.
    for name in ['src/server/database', 'package-lock.json', '.nvmrc']:
        before, after = live / name, candidate / name
        if name == '.nvmrc' and not before.exists():
            # Earlier runtime exports omitted .nvmrc. Confirm runtime major below.
            continue
        if before.is_dir() and after.is_dir():
            old, new = database_files(live), database_files(candidate)
            if old != new:
                attachment_review(candidate, live)
        elif not before.is_file() or not after.is_file():
            raise RuntimeError('Runtime dependency/Node change requires separate review.')
        elif digest(before) != digest(after):
            if name != 'package-lock.json' or not reviewed_lockfile_change(before, after):
                raise RuntimeError('Runtime dependency/Node change requires separate review.')
    previous = json.loads((live / 'package.json').read_text())
    incoming = json.loads((candidate / 'package.json').read_text())
    for key in ['dependencies', 'overrides', 'engines', 'type']:
        if previous.get(key) != incoming.get(key):
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


def attachment_review(candidate, live):
    import deploy_blocks45 as backups
    paths = sorted((candidate / 'src/server/database/migrations').glob('*.sql'))
    if len(paths) != 16 or [p.name[:3] for p in paths] != ['%03d' % n for n in range(1, 17)]:
        raise RuntimeError('Block 08 migration sequence differs.')
    previous = backups.git_export(ATTACHMENT_BEFORE)
    approved = backups.git_export(ATTACHMENT_REVIEWED)
    if not backups.matches_export(live, previous) or not backups.matches_export(candidate, approved):
        raise RuntimeError('Database transition differs from the exact block 08 review.')
    if any(previous[name] != approved[name] for name in ['package-lock.json', '.nvmrc']):
        raise RuntimeError('Block 08 approval does not include dependency/Node changes.')
    for path in paths[:15]:
        name = 'src/server/database/migrations/' + path.name
        if previous.get(name) != approved.get(name):
            raise RuntimeError('Block 08 changes a previously applied migration.')


def attachment_snapshot():
    import deploy_blocks45 as backups
    return backups.database_snapshot(ATTACHMENT_TABLES)


def attachment_versions(candidate):
    return [{'version':i + 1, 'checksum':digest(path)} for i, path in
            enumerate(sorted((candidate / 'src/server/database/migrations').glob('*.sql')))]


def verify_attachment_migration(candidate, before):
    import deploy_blocks45 as backups
    after = attachment_snapshot()
    versions = attachment_versions(candidate)
    if before['versions'] != versions[:15] or after['versions'] != versions or after['tables'] != before['tables']:
        raise RuntimeError('Block 08 migration/data preservation failed.')
    total = 'coalesce((SELECT sum(octet_length(profile_ciphertext)+524) FROM hash_talk.accounts),0)'
    for table in ['vault_operations', 'message_recovery_keys', 'message_packets',
                  'matrix_devices', 'matrix_one_time_keys', 'matrix_envelopes', 'message_attachments']:
        total += ' + coalesce((SELECT sum(charge) FROM hash_talk.' + table + '),0)'
    actual = backups.pg(['psql', '--no-psqlrc', '--set=ON_ERROR_STOP=1', '--tuples-only', '--no-align', '-c',
                         'SELECT used_bytes=(' + total + ') AND NOT EXISTS(SELECT 1 FROM hash_talk.message_attachments) '
                         'FROM hash_talk.content_usage WHERE singleton'])
    if actual.strip() != b't':
        raise RuntimeError('Block 08 attachment table/actual-use ledger inconsistent.')


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
    public_sources.reconstruct(config, candidate, DATA / 'git/0xdmme.git')
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
    shutil.copytree(dependencies, candidate / 'node_modules', symlinks=True)
    for path in [candidate, *candidate.rglob('*')]:
        if path.is_symlink():
            os.lchown(path, 0, 0)
            continue
        os.chown(path, 0, 0)
        os.chmod(path, 0o755 if path.is_dir() or path.stat().st_mode & 0o111 else 0o644)
    return candidate


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
            run(['systemctl', 'restart', UNIT])
            wait_ready()
        except BaseException:
            raise ActivationFailed(False) from None
        raise ActivationFailed(True) from None


def receipt(work, data):
    temporary = work / 'result.tmp'
    with temporary.open('x') as handle:
        json.dump(data, handle)
        handle.flush()
        os.fsync(handle.fileno())
    temporary.replace(work / 'result.json')


def activate_attachments(config, work, candidate, before_state):
    """Reviewed 015→016 transition; reuse existing private backup/restore tools."""
    import deploy_blocks45 as backups
    attachment_review(candidate, DATA / 'release')
    if attachment_snapshot()['versions'] != attachment_versions(candidate)[:15]:
        raise RuntimeError('Live schema differs from the block 08 predecessor.')
    if backups.own_free_bytes() < 2 * MAX_RELEASE + 2 * backups.MAX_BACKUP:
        raise RuntimeError('Insufficient disk budget for private backups.')
    receipt(work, {'status':'maintenance', 'commit':config['commit']})
    opened = installed = False
    before = objects = checksum = None
    live, previous = DATA / 'release', work / 'previous'
    try:
        run(['systemctl', 'stop', UNIT])
        if run(['systemctl', 'show', UNIT, '--property=MainPID', '--value']).strip() != b'0':
            raise RuntimeError('Own writer did not stop.')
        before, objects = attachment_snapshot(), backups.objects_snapshot()
        checksum = backups.backup(work)
        if backups.file_tree(work / 'objects-backup') != objects:
            raise RuntimeError('Object backup verification failed.')
        backups.validate_restore(work, before, checksum, snapshot=attachment_snapshot)
        receipt(work, {'status':'backed-up', 'commit':config['commit'], 'backup_sha256':checksum})
        backups.migrate(candidate)
        verify_attachment_migration(candidate, before)
        if backups.objects_snapshot() != objects:
            raise RuntimeError('Existing objects changed during migration.')
        preservation(config['baseline'])
        if own_state() != before_state:
            raise RuntimeError('Configuration/database process changed.')
        live.rename(previous)
        candidate.rename(live)
        installed = True
        receipt(work, {'status':'opening', 'commit':config['commit'], 'backup_sha256':checksum})
        # New writes may exist after this point; never automatically restore old data.
        opened = True
        run(['systemctl', 'start', UNIT])
        wait_ready(config['files'])
        preservation(config['baseline'])
        if own_state() != before_state:
            raise RuntimeError('Configuration/database process changed.')
    except BaseException:
        rollback = False
        try:
            run(['systemctl', 'stop', UNIT])
            if not opened:
                if checksum is not None and before is not None and attachment_snapshot() != before:
                    backups.restore(work, before, checksum, snapshot=attachment_snapshot)
                if before is not None and attachment_snapshot() != before:
                    raise RuntimeError('Pre-opening database return failed.')
                if installed:
                    live.rename(candidate)
                if previous.exists():
                    previous.rename(live)
                run(['systemctl', 'start', UNIT])
                wait_ready()
                preservation(config['baseline'])
                rollback = own_state() == before_state
        except BaseException:
            rollback = False
        receipt(work, {'status':'failed', 'commit':config['commit'],
                       'rollback_verified':rollback, 'new_state_preserved':opened})
        raise RuntimeError('Transition failed; old release returned.' if rollback else
                           'Transition failed; own service stopped and state retained for review.') from None
    result = {'status':'published', 'commit':config['commit'], 'migrations_verified':True,
              'public_build_verified':True, 'preservation_checks_passed':True,
              'private_backup_retained':True, 'shared_services_restarted':False}
    receipt(work, result)
    return result


def activate(config, work):
    before = preflight(config)
    if not work.is_dir() or work.is_symlink() or (work / 'result.json').exists():
        raise RuntimeError('Deployment workspace unavailable/already used.')
    if digest(work / 'build.tar.gz') != config['archive_sha256']:
        raise RuntimeError('Uploaded archive changed.')
    candidate = prepare(config, work)
    preservation(config['baseline'])
    if own_state() != before:
        raise RuntimeError('Own configuration/database service changed.')
    if database_files(candidate) != database_files(DATA / 'release'):
        # Any unreviewed database change was rejected by prepare()/compatibility().
        return activate_attachments(config, work, candidate, before)
    # Interrupted processes leave an explicit receipt; never blindly retry them.
    receipt(work, {'status': 'activating', 'commit': config['commit']})
    def verify():
        wait_ready(config['files'])
        preservation(config['baseline'])
        if own_state() != before:
            raise RuntimeError('Own configuration/database service changed.')
    try:
        exchange(candidate, work / 'previous', verify)
    except BaseException as error:
        receipt(work, {'status': 'failed', 'commit': config['commit'],
                       'rollback_verified': isinstance(error, ActivationFailed) and error.rollback_verified})
        raise
    result = {'status': 'published', 'commit': config['commit'],
              'public_build_verified': True, 'preservation_checks_passed': True,
              'rollback_release_retained': True, 'shared_services_restarted': False}
    receipt(work, result)
    prune_completed(work)
    return result


def prune_completed(current):
    # Only workspaces made by this command; the current workspace keeps the previous release.
    for work in DATA.glob('deployment-*'):
        if work == current or work.is_symlink() or not work.is_dir():
            continue
        if not re.fullmatch(r'deployment-[a-f0-9]{40}', work.name):
            continue
        marker = work / 'result.json'
        if not marker.is_file() or marker.is_symlink():
            continue
        old = json.loads(marker.read_text())
        if old.get('status') != 'published' or old.get('commit') != work.name[len('deployment-'):]:
            continue
        if old.get('private_backup_retained') is True:
            continue
        if work.stat().st_uid != os.geteuid() or set(p.name for p in work.iterdir()) != {'build.tar.gz', 'previous', 'result.json'}:
            raise RuntimeError('Old deployment workspace requires manual review; new release remains active.')
        previous = work / 'previous'
        if previous.is_symlink() or not previous.is_dir():
            raise RuntimeError('Old rollback path requires manual review; new release remains active.')
        allowed = {'src', 'infra', 'dist', 'node_modules', 'package.json', 'package-lock.json', '.nvmrc'}
        if not set(p.name for p in previous.iterdir()).issubset(allowed):
            raise RuntimeError('Old rollback contents require manual review; new release remains active.')
        shutil.rmtree(work)


def main():
    raw = sys.stdin.buffer.read(24 * 1024 * 1024 + 1)
    if len(raw) > 24 * 1024 * 1024:
        raise RuntimeError('Deployment input exceeded budget.')
    config = json.loads(raw)
    validate(config)
    action = sys.argv[1]
    work = DATA / ('deployment-' + config['commit'])
    if action == 'check':
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
                    return {'preflight_passed': True, 'already_active': True, 'commit': config['commit']}
        return {'preflight_passed': True, 'activated': False}
    if action not in ['receive', 'activate']:
        raise RuntimeError('Invalid deployment action.')
    fd = os.open(DATA / 'deployment.lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        preflight(config)
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
        return activate(config, work)


if __name__ == '__main__':
    try:
        print(json.dumps(main()))
    except Exception as error:
        print(json.dumps({'deployment_failed': True, 'error_type': type(error).__name__,
                          'message': str(error) if isinstance(error, RuntimeError)
                          else 'Private deployment error; inspect the local log.'}))
        raise SystemExit(1)
