"""Prepare an exact Git release locally and explicitly deploy only 0xDMme."""

import argparse
import base64
import hashlib
import io
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import subprocess
import tarfile
import tempfile
import urllib.parse
import urllib.request

from deploy_remote import digest, validate
import deploy_sources as public_sources
import deploy_runtime as runtime
import deploy_request_limit as request_limits

ROOT = Path(__file__).resolve().parents[2]
OWNER = 'karma352431231-ship-it'
ORIGIN = f'https://github.com/{OWNER}/0xDMme.git'
LOCAL = ROOT / '.local/deployment'


def run(args, cwd=ROOT, timeout=30):
    result = subprocess.run(args, cwd=cwd, capture_output=True, timeout=timeout,
                            env=dict(os.environ, GIT_TERMINAL_PROMPT='0'))
    if result.returncode:
        LOCAL.mkdir(parents=True, exist_ok=True, mode=0o700)
        log = LOCAL / 'last-command.log'
        log.write_bytes((result.stdout + result.stderr)[-65536:])
        log.chmod(0o600)
        raise RuntimeError('Command failed: ' + args[0] + '; details remain in .local/.')
    return result.stdout


def repository():
    if run(['git', 'remote', 'get-url', 'origin']).decode().strip() != ORIGIN:
        raise RuntimeError('Unexpected repository; deployment refused.')
    if run(['git', 'status', '--porcelain']).strip():
        raise RuntimeError('Commit reviewed changes before deployment.')
    branch = run(['git', 'symbolic-ref', '--short', 'HEAD']).decode().strip()
    revision = run(['git', 'rev-parse', 'HEAD']).decode().strip()
    if not re.fullmatch(r'codex/[A-Za-z0-9][A-Za-z0-9._/-]*', branch):
        raise RuntimeError('An explicit codex branch is required.')
    remote = run(['git', '-c', f'credential.username={OWNER}', 'ls-remote', '--exit-code',
                  'origin', 'refs/heads/' + branch]).decode().split()
    if not remote or remote[0] != revision:
        raise RuntimeError('Push the exact reviewed commit first.')
    return revision, branch


def require_ci(data, revision, branch):
    runs = data.get('workflow_runs', [])
    if not runs:
        raise RuntimeError('No CI run for this commit.')
    latest = max(runs, key=lambda r: r['id'])
    if (latest.get('head_sha') != revision or latest.get('head_branch') != branch or
            latest.get('event') != 'push' or latest.get('path') != '.github/workflows/check.yml' or
            latest.get('head_repository', {}).get('full_name') != OWNER + '/0xDMme' or
            latest.get('status') != 'completed' or latest.get('conclusion') != 'success'):
        raise RuntimeError('Latest exact-commit CI has not passed; activation refused.')
    return latest['html_url']


def ci(revision, branch):
    query = urllib.parse.urlencode({'head_sha': revision, 'branch': branch,
                                    'event': 'push', 'per_page': 10})
    request = urllib.request.Request(
        f'https://api.github.com/repos/{OWNER}/0xDMme/actions/workflows/check.yml/runs?' + query,
        headers={'Accept': 'application/vnd.github+json', 'User-Agent': '0xdmme-deploy'})
    with urllib.request.urlopen(request, timeout=20) as response:
        raw = response.read(1024 * 1024 + 1)
        if len(raw) > 1024 * 1024:
            raise RuntimeError('CI response budget exceeded.')
    return require_ci(json.loads(raw), revision, branch)


def cached_build(output, revision, branch):
    manifest_path, archive_path = output / 'manifest.json', output / 'build.tar.gz'
    if not manifest_path.exists() and not archive_path.exists():
        return None
    if any(p.is_symlink() or not p.is_file() for p in [manifest_path, archive_path]):
        raise RuntimeError('Incomplete/unsafe cached build; review this local artifact.')
    if manifest_path.stat().st_size > 128 * 1024 or archive_path.stat().st_size > 16 * 1024 * 1024:
        raise RuntimeError('Cached build budget exceeded.')
    manifest = json.loads(manifest_path.read_text())
    validate(manifest)
    if (manifest['commit'] != revision or manifest['branch'] != branch
            or archive_path.stat().st_size != manifest['archive_bytes']
            or digest(archive_path) != manifest['archive_sha256']):
        raise RuntimeError('Cached build commit/archive mismatch.')
    exported = run(['git', 'archive', revision, 'src', 'infra', 'package.json', 'package-lock.json', '.nvmrc'])
    with tarfile.open(fileobj=io.BytesIO(exported)) as archive:
        authored = {m.name:hashlib.sha256(archive.extractfile(m).read()).hexdigest()
                    for m in archive.getmembers() if m.isfile()}
    if authored != {n:h for n,h in manifest['files'].items() if not n.startswith('dist/')}:
        raise RuntimeError('Cached build source manifest differs from Git.')
    if digest(ROOT / 'package-lock.json') != authored['package-lock.json']:
        raise RuntimeError('Development lockfile differs from exported commit.')
    with tarfile.open(archive_path) as archive:
        from deploy_remote import extract
        with tempfile.TemporaryDirectory(prefix='verify-', dir=output) as temporary:
            extract(archive, Path(temporary), ['dist'])
            actual = {str(p.relative_to(temporary)):digest(p) for p in Path(temporary).rglob('*') if p.is_file()}
    expected = {n:h for n,h in manifest['files'].items() if n.startswith('dist/') and n not in manifest.get('source_parts', [])}
    if actual != expected:
        raise RuntimeError('Cached build public assets differ from its manifest.')
    public_sources.verify_local(manifest, ROOT / public_sources.SOURCE_BLOB)
    return manifest, archive_path


def prepare(revision, branch):
    output = LOCAL / revision
    LOCAL.mkdir(parents=True, exist_ok=True, mode=0o700)
    retained = [p for p in LOCAL.iterdir() if p.is_dir() and re.fullmatch(r'[a-f0-9]{40}', p.name)]
    if not output.exists() and len(retained) >= 16:
        raise RuntimeError('Local artifact budget reached; review old .local/deployment builds.')
    output.mkdir(parents=True, exist_ok=True, mode=0o700)
    cached = cached_build(output, revision, branch)
    if cached:
        return cached
    archive_path = output / 'build.tar.gz'
    manifest_path = output / 'manifest.json'
    with tempfile.TemporaryDirectory(prefix='build-', dir=LOCAL) as temporary:
        source = Path(temporary)
        exported = run(['git', 'archive', revision], timeout=30)
        with tarfile.open(fileobj=io.BytesIO(exported)) as archive:
            archive.extractall(source, filter='data')
        if digest(source / 'package-lock.json') != digest(ROOT / 'package-lock.json'):
            raise RuntimeError('Development lockfile differs from exported commit.')
        # Real directories are necessary: esbuild must report node_modules/... inputs
        # so frontendSource includes every bundled vendor source/license. Hardlinks
        # reuse immutable installed files without reinstalling/building on the VPS.
        shutil.copytree(ROOT / 'node_modules', source / 'node_modules',
                        copy_function=os.link, symlinks=True)
        run(['node', 'src/tools/build-web.ts'], cwd=source, timeout=60)
        runtime.stage(source, Path.home() / '.npm/_cacache')
        public_source = next((source / 'dist/web').glob('source-*.tar.gz'))
        with tarfile.open(public_source) as archive:
            if not any(n.startswith('node_modules/@scure/base/') for n in archive.getnames()):
                raise RuntimeError('Corresponding vendor sources absent; deployment refused.')
        files = {}
        for base in ['src', 'infra', 'dist']:
            for path in (source / base).rglob('*'):
                if path.is_symlink():
                    raise RuntimeError('Authored/build symlink rejected.')
                if path.is_file():
                    files[str(path.relative_to(source))] = digest(path)
        for name in ['package.json', 'package-lock.json', '.nvmrc']:
            files[name] = digest(source / name)
        with tarfile.open(archive_path, 'w:gz') as archive:
            archive.add(source / 'dist', arcname='dist',
                        filter=lambda info:None if info.name in public_sources.PARTS else info)
        script = next('/' + p.name for p in (source / 'dist/web').glob('app-*.js'))
        manifest = {'commit': revision, 'branch': branch, 'files': files, 'script': script,
                    'archive_bytes': archive_path.stat().st_size,
                    'archive_sha256': digest(archive_path), **public_sources.metadata(files)}
        validate(manifest)
        public_sources.verify_local(manifest, source / public_sources.SOURCE_BLOB)
        manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')
        manifest_path.chmod(0o600)
        archive_path.chmod(0o600)
    return manifest, archive_path


def private_inputs():
    values = []
    for name in ['VPS_SSH_TARGET', 'VPS_DEPLOY_BASELINE.json']:
        path = ROOT / '.local' / name
        if path.is_symlink() or not path.is_file() or path.stat().st_mode & 0o077:
            raise RuntimeError('Private deployment input missing or permissions too broad.')
        run(['git', 'check-ignore', '--', str(path.relative_to(ROOT))])
        values.append(path.read_text())
    target = values[0].strip()
    if not re.fullmatch(r'[A-Za-z0-9_][A-Za-z0-9_.-]*@[A-Za-z0-9][A-Za-z0-9.-]*', target):
        raise RuntimeError('Invalid private SSH target.')
    baseline = json.loads(values[1])
    if not baseline.get('files') or not baseline.get('services') or not baseline.get('sites'):
        raise RuntimeError('Private preservation baseline incomplete.')
    return target, baseline


def remote(action, config, target):
    modules = []
    for name in ['deploy_sources', 'deploy_runtime', 'deploy_remote', 'deploy_blocks45', 'deploy_request_limit', 'deploy_background']:
        path = ROOT / 'infra/staging' / (name + '.py')
        if digest(path) != config['files'].get('infra/staging/' + name + '.py'):
            raise RuntimeError('Deployment executor changed after the reviewed commit.')
        modules.append('m=types.ModuleType(' + repr(name) + ');sys.modules[' + repr(name) +
                       ']=m;exec(' + repr(path.read_text()) + ',m.__dict__)')
    code = ('import sys,types,json;' + ';'.join(modules) +
            ';print(json.dumps(sys.modules["deploy_remote"].main()))')
    worker_paths = []
    if action == 'activate' and 'src/server/worker.ts' in config['files']:
        worker_paths = ['-p', 'ReadWritePaths=/var/lib/0xdmme/data /etc/systemd/system/0xdmme-test.service.d',
                        '-p', 'TemporaryFileSystem=/tmp:rw,nosuid,nodev,noexec,size=16M',
                        '-p', 'Environment=TMPDIR=/tmp']
    proxy_properties = []
    if action == 'requests':
        proxy_properties = ['-p', 'TemporaryFileSystem=/var/log/nginx:rw',
                            '-p', 'BindPaths=/dev/null:/run/nginx.pid']
    command = shlex.join([
        'systemd-run', '--quiet', '--wait', '--pipe', '--collect',
        '--unit=0xdmme-deploy-' + action + '-' + config['commit'][:12],
        '--slice=xdmme-test.slice', '-p', 'CPUQuota=10%', '-p', 'MemoryMax=192M',
        '-p', 'MemorySwapMax=0', '-p', 'TasksMax=32', '-p', 'Nice=19',
        '-p', 'IOSchedulingClass=idle', '-p', 'NoNewPrivileges=yes',
        '-p', 'ProtectSystem=strict', '-p', 'ProtectHome=yes',
        '-p', 'ReadWritePaths=/var/lib/0xdmme/data' +
        (' ' + str(request_limits.PROXY) if action == 'requests' else ''),
        '-p', 'RuntimeMaxSec=240',
        *proxy_properties, *worker_paths, '/usr/bin/python3', '-c', code, action])
    result = subprocess.run(['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10',
                             '-o', 'StrictHostKeyChecking=yes', target, command],
                            input=json.dumps(config).encode(), capture_output=True, timeout=250)
    log = LOCAL / config['commit'] / (action + '.log')
    log.write_bytes((result.stdout + result.stderr)[-65536:])
    log.chmod(0o600)
    if result.returncode:
        raise RuntimeError('Remote ' + action + ' failed; inspect .local/ before retrying.')
    return json.loads(result.stdout.decode().strip().splitlines()[-1])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--prepare', action='store_true', help='Prepare the exact-commit build locally only.')
    mode.add_argument('--check', action='store_true', help='Prepare, synchronize Git and verify; do not activate.')
    mode.add_argument('--activate', action='store_true', help='Run the explicitly approved own code deployment.')
    parser.add_argument('--request-limit', action='store_true',
                        help='Apply the separately approved 30 r/s site limit after code activation.')
    args = parser.parse_args()
    if args.request_limit and args.prepare:
        parser.error('--request-limit requires --check or --activate.')
    revision, branch = repository()
    proof = ci(revision, branch)
    manifest, archive = prepare(revision, branch)
    if args.prepare:
        print(json.dumps({'prepared': True, 'commit': revision, 'ci': proof, 'activated': False}))
        return
    target, baseline = private_inputs()
    config = dict(manifest, baseline=baseline)
    if args.request_limit:
        review = ROOT / '.local/VPS_REQUEST_LIMIT_REVIEW.json'
        if review.is_symlink() or not review.is_file() or review.stat().st_mode & 0o077:
            raise RuntimeError('Private request-limit review missing or permissions too broad.')
        run(['git', 'check-ignore', '--', str(review.relative_to(ROOT))])
        if review.stat().st_size > 2 * request_limits.MAX_CONFIG + 2048:
            raise RuntimeError('Private request-limit review exceeded budget.')
        config['request_limit'] = json.loads(review.read_text())
        request_limits.validate(config['request_limit'])
    # Existing source-sync contract checks clean tree, canonical remote and exact SHA.
    run(['python3', 'infra/staging/sync-git.py'], timeout=150)
    checked = remote('check', config, target)
    print(json.dumps(checked), flush=True)
    if args.check:
        return
    if checked.get('already_active'):
        if args.request_limit:
            print(json.dumps(remote('requests', config, target)))
        return
    repository()  # Refuse a changed checkout/branch before sending the build.
    if run(['git', 'rev-parse', 'HEAD']).decode().strip() != revision:
        raise RuntimeError('Commit changed during release preparation.')
    remote('receive', dict(config, archive=base64.b64encode(archive.read_bytes()).decode()), target)
    result = remote('activate', config, target)
    print(json.dumps(result))
    if args.request_limit:
        print(json.dumps(remote('requests', config, target)))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(json.dumps({'deployment_failed': True, 'error_type': type(error).__name__,
                          'message': str(error) if isinstance(error, RuntimeError)
                          else 'Private error; inspect .local/ logs before retrying.'}))
        raise SystemExit(1)
