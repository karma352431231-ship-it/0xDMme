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

DATA = Path('/var/lib/0xdmme/data')
UNIT = '0xdmme-test.service'
ORIGIN = 'https://0xdmme.app'
MAX_ARCHIVE = 16 * 1024 * 1024
MAX_RELEASE = 128 * 1024 * 1024


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


def fetch(path):
    result = run(['curl', '--silent', '--fail', '--max-time', '5', ORIGIN + path], timeout=10)
    if len(result) > 2 * 1024 * 1024:
        raise RuntimeError('Public response budget exceeded.')
    return result


def healthy(files=None):
    if json.loads(fetch('/health/ready')).get('status') != 'ok':
        raise RuntimeError('Own service not ready.')
    if files:
        for name, expected in files.items():
            if name.startswith('dist/web/') and name != 'dist/web/assets.json':
                url = '/' if name.endswith('/index.html') else '/' + name[len('dist/web/'):]
                if hashlib.sha256(fetch(url)).hexdigest() != expected:
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


def compatibility(candidate, live):
    # Startup calls migrate(); guard both SQL and the code that executes it.
    for name in ['src/server/database', 'package-lock.json', '.nvmrc']:
        before, after = live / name, candidate / name
        if name == '.nvmrc' and not before.exists():
            # Earlier runtime exports omitted .nvmrc. Confirm runtime major below.
            continue
        if before.is_dir() and after.is_dir():
            old = {str(p.relative_to(before)): digest(p) for p in before.rglob('*') if p.is_file()}
            new = {str(p.relative_to(after)): digest(p) for p in after.rglob('*') if p.is_file()}
            if old != new:
                raise RuntimeError('Database code/migrations require separate review.')
        elif not before.is_file() or not after.is_file() or digest(before) != digest(after):
            raise RuntimeError('Runtime dependency/Node change requires separate review.')
    previous = json.loads((live / 'package.json').read_text())
    incoming = json.loads((candidate / 'package.json').read_text())
    for key in ['dependencies', 'overrides', 'engines', 'type']:
        if previous.get(key) != incoming.get(key):
            raise RuntimeError('Runtime contract changed; separate review required.')
    if run(['/usr/bin/node', '--version']).decode().strip().lstrip('v') != (candidate / '.nvmrc').read_text().strip():
        raise RuntimeError('Installed Node differs from approved release.')


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
    actual = {str(p.relative_to(candidate)): digest(p) for p in candidate.rglob('*') if p.is_file()}
    if actual != config['files']:
        raise RuntimeError('Git source/build manifest mismatch.')
    compatibility(candidate, DATA / 'release')
    dependencies = DATA / 'release/node_modules'
    count, size = 0, 0
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
