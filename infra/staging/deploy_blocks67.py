"""Reviewed blocks 06–07 activation; ordinary deployment guards remain unchanged."""

import base64
import fcntl
import hashlib
import io
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import subprocess
import sys
import tarfile

import deploy_remote as base
import deploy_blocks45 as backup_tools
import deploy_sources as public_sources

BEFORE = '32663bb4a9a0e219d3529a061509846566239f0f'
REVIEWED = '8e74bb1a1d7e8eb9cb9382ef146eb07df4c9a1e7'
# Compatibility names for the reviewed transition; the common module owns
# source distribution so future routine updates do not duplicate this executor.
SOURCE_HASH = public_sources.SOURCE_HASH
SOURCE_BYTES = public_sources.SOURCE_BYTES
SOURCE_BLOB = public_sources.SOURCE_BLOB
PART_BYTES = public_sources.PART_BYTES
PARTS = public_sources.PARTS
PROXY = Path('/etc/nginx/sites-available/0xdmme-test.conf')
OLD_TABLES = ('accounts', 'content_usage', 'device_directories', 'device_events', 'device_links',
              'login_challenges', 'login_devices', 'login_handoffs', 'login_sessions',
              'service_metadata', 'vault_heads', 'vault_operations')
NEW_TABLES = ('contact_controls', 'contact_relations', 'contact_blocks', 'message_recovery_keys',
              'message_packets', 'message_references', 'message_heads', 'matrix_devices',
              'matrix_one_time_keys', 'matrix_envelopes')
MAX_BACKUP = backup_tools.MAX_BACKUP
file_tree = backup_tools.file_tree
objects_snapshot = backup_tools.objects_snapshot
backup = backup_tools.backup
migrate = backup_tools.migrate
own_free_bytes = backup_tools.own_free_bytes


def preservation(config):
    historical = config['baseline']
    reviewed = config['site_review']
    if len(reviewed) != len(historical['sites']):
        raise RuntimeError('Site review set differs from historical inventory.')
    differences = 0
    for old, current in zip(historical['sites'], reviewed):
        if current['host'] != old['host'] or current['historical'] != old['status']:
            raise RuntimeError('Historical site evidence changed.')
        if current['current'] != old['status']:
            differences += 1
            if old['status'] != '502' or current['current'] != '404':
                raise RuntimeError('Unreviewed pre-existing HTTP discrepancy.')
    if differences > 1:
        raise RuntimeError('Reviewed pre-existing HTTP discrepancy differs.')
    # Historical files/process fingerprints remain authoritative and immutable.
    # Only the recorded pre-existing HTTP difference is compared before/after.
    current = dict(historical, sites=[{'host':s['host'], 'status':s['current']} for s in reviewed])
    base.preservation(current)


def validate_proxy(proposal):
    if proposal['path'] != str(PROXY):
        raise RuntimeError('Proxy proposal targets another site.')
    old, new = proposal['old_content'], proposal['new_content']
    if old.count('client_max_body_size 5m;') != 1 or new != old.replace('client_max_body_size 5m;', 'client_max_body_size 8m;'):
        raise RuntimeError('Proxy proposal exceeds the approved body-limit change.')
    for key, content in [('old', old), ('new', new)]:
        if hashlib.sha256(content.encode()).hexdigest() != proposal[key + '_sha256']:
            raise RuntimeError('Proxy proposal digest mismatch.')


def proxy_change(config):
    proposal = config['proxy']
    validate_proxy(proposal)
    preservation(config)
    if PROXY.is_symlink() or not PROXY.is_file():
        raise RuntimeError('Unexpected own proxy configuration path.')
    checksum = base.digest(PROXY)
    if checksum == proposal['new_sha256']:
        base.run(['nginx', '-t'])
        return {'proxy_limit_mib':8, 'already_configured':True}
    if checksum != proposal['old_sha256']:
        raise RuntimeError('Own proxy changed since review.')
    previous = PROXY.read_bytes()
    try:
        with PROXY.open('wb') as handle:
            handle.write(proposal['new_content'].encode())
            handle.flush()
            os.fsync(handle.fileno())
        base.run(['nginx', '-t'])
        base.run(['systemctl', 'reload', 'nginx'])
        preservation(config)
    except BaseException:
        with PROXY.open('wb') as handle:
            handle.write(previous)
            handle.flush()
            os.fsync(handle.fileno())
        base.run(['nginx', '-t'])
        base.run(['systemctl', 'reload', 'nginx'])
        preservation(config)
        raise RuntimeError('Proxy change failed; own configuration returned.') from None
    if base.digest(PROXY) != proposal['new_sha256']:
        raise RuntimeError('Own proxy publication digest differs.')
    return {'proxy_limit_mib':8, 'graceful_reload_verified':True, 'shared_services_restarted':False}


fetch = base.fetch
healthy = base.healthy
wait_ready = base.wait_ready


def preflight(config):
    base.validate(config)
    validate_proxy(config['proxy'])
    preservation(config)
    if base.run(['findmnt', '-n', '-o', 'TARGET', '--target', str(base.DATA)]).decode().strip() != str(base.DATA):
        raise RuntimeError('Own bounded filesystem absent.')
    live = base.DATA / 'release'
    if not live.is_dir() or live.is_symlink():
        raise RuntimeError('Unexpected own release path.')
    if own_free_bytes() < 2 * base.MAX_RELEASE + 2 * MAX_BACKUP:
        raise RuntimeError('Insufficient own backup/release budget.')
    actual = base.run(['git', '--git-dir=' + str(base.DATA / 'git/0xdmme.git'),
                       'rev-parse', 'refs/heads/' + config['branch']]).decode().strip()
    if actual != config['commit']:
        raise RuntimeError('VPS Git revision mismatch.')
    if base.digest(PROXY) not in (config['proxy']['old_sha256'], config['proxy']['new_sha256']):
        raise RuntimeError('Own proxy differs from reviewed transition.')
    healthy()
    return base.own_state()


def reviewed_candidate(candidate, live):
    previous, approved = backup_tools.git_export(BEFORE), backup_tools.git_export(REVIEWED)
    if not backup_tools.matches_export(live, previous):
        raise RuntimeError('Live release differs from the reviewed predecessor.')
    if not backup_tools.matches_export(candidate, approved):
        raise RuntimeError('Incoming application/runtime differs from reviewed blocks 06–07.')
    for name in ['package-lock.json', '.nvmrc']:
        if previous[name] != approved[name]:
            raise RuntimeError('Dependency/Node transition is outside this approval.')
    old, new = json.loads(previous['package.json']), json.loads(approved['package.json'])
    if {k:v for k,v in old.items() if k != 'scripts'} != {k:v for k,v in new.items() if k != 'scripts'}:
        raise RuntimeError('Runtime contract changed.')
    constraint = re.fullmatch(r'>=(\d+)\.(\d+)\.(\d+) <(\d+)', new['engines']['node'])
    installed = re.fullmatch(r'v(\d+)\.(\d+)\.(\d+)', base.run(['/usr/bin/node', '--version']).decode().strip())
    if not constraint or not installed:
        raise RuntimeError('Node contract could not be verified.')
    actual = tuple(int(installed[i]) for i in [1, 2, 3])
    if actual < tuple(int(constraint[i]) for i in [1, 2, 3]) or actual >= (int(constraint[4]), 0, 0):
        raise RuntimeError('Installed Node is outside the unchanged range.')


def source_parts(config, candidate):
    public_sources.reconstruct(config, candidate, base.DATA / 'git/0xdmme.git')

def prepare_candidate(config, work):
    blob = base.run(['git', '--git-dir=' + str(base.DATA / 'git/0xdmme.git'), 'archive',
                     config['commit'], 'src', 'infra', 'package.json', 'package-lock.json', '.nvmrc'])
    candidate = work / 'candidate'
    candidate.mkdir(mode=0o755)
    with tarfile.open(fileobj=io.BytesIO(blob)) as archive:
        base.extract(archive, candidate, ['src', 'infra', 'package.json', 'package-lock.json', '.nvmrc'])
    with tarfile.open(work / 'build.tar.gz') as archive:
        base.extract(archive, candidate, ['dist'])
    source_parts(config, candidate)
    if file_tree(candidate) != config['files']:
        raise RuntimeError('Git/build manifest mismatch.')
    reviewed_candidate(candidate, base.DATA / 'release')
    dependencies = base.DATA / 'release/node_modules'
    count = 0
    size = sum(p.stat().st_size for p in candidate.rglob('*') if p.is_file())
    for path in dependencies.rglob('*'):
        count += 1
        if path.is_symlink() and not path.resolve().is_relative_to(dependencies):
            raise RuntimeError('Runtime dependency link escapes its directory.')
        if path.is_file():
            size += path.stat().st_size
        if count > 4096 or size > base.MAX_RELEASE:
            raise RuntimeError('Combined runtime/source release budget exceeded.')
    shutil.copytree(dependencies, candidate / 'node_modules', symlinks=True)
    for path in [candidate, *candidate.rglob('*')]:
        if path.is_symlink():
            os.lchown(path, 0, 0)
        else:
            os.chown(path, 0, 0)
            os.chmod(path, 0o755 if path.is_dir() or path.stat().st_mode & 0o111 else 0o644)
    return candidate


def database_snapshot():
    return backup_tools.database_snapshot(OLD_TABLES)


def expected_versions(candidate):
    paths = sorted((candidate / 'src/server/database/migrations').glob('*.sql'))
    if len(paths) != 15 or [p.name[:3] for p in paths] != ['%03d' % n for n in range(1,16)]:
        raise RuntimeError('Reviewed migration sequence differs.')
    return [{'version':i+1, 'checksum':base.digest(p)} for i,p in enumerate(paths)]


def validate_restore(work, expected, checksum):
    backup_tools.validate_restore(work, expected, checksum, snapshot=database_snapshot)


def restore(work, expected, checksum):
    backup_tools.restore(work, expected, checksum, snapshot=database_snapshot)


def verify_migration(candidate, before):
    after = database_snapshot()
    expected = expected_versions(candidate)
    if before['versions'] != expected[:9] or after['versions'] != expected or after['tables'] != before['tables']:
        raise RuntimeError('Migration checksum/data preservation failed.')
    empty = ' AND '.join('NOT EXISTS(SELECT 1 FROM hash_talk.' + name + ')' for name in NEW_TABLES)
    total = "coalesce((SELECT sum(octet_length(profile_ciphertext)+524) FROM hash_talk.accounts),0)"
    total += " + coalesce((SELECT sum(charge) FROM hash_talk.vault_operations),0)"
    for name in ['message_recovery_keys', 'message_packets', 'matrix_devices', 'matrix_one_time_keys', 'matrix_envelopes']:
        total += ' + coalesce((SELECT sum(charge) FROM hash_talk.' + name + '),0)'
    result = backup_tools.pg(['psql', '--no-psqlrc', '--set=ON_ERROR_STOP=1', '--tuples-only', '--no-align', '-c',
                              'SELECT used_bytes=(' + total + ') AND ' + empty + ' FROM hash_talk.content_usage WHERE singleton'])
    if result.strip() != b't':
        raise RuntimeError('Migrated actual-use ledger/new tables inconsistent.')


def activate(config, work):
    before_state = preflight(config)
    if not work.is_dir() or work.is_symlink() or (work / 'result.json').exists():
        raise RuntimeError('Interrupted/completed transition requires review; never blindly retry.')
    for name, checksum in [('build.tar.gz', config['archive_sha256'])]:
        if base.digest(work / name) != checksum:
            raise RuntimeError('Transition archive digest mismatch.')
    if base.digest(PROXY) != config['proxy']['new_sha256']:
        raise RuntimeError('Approved proxy limit must be activated first.')
    candidate = prepare_candidate(config, work)
    if database_snapshot()['versions'] != expected_versions(candidate)[:9]:
        raise RuntimeError('Live schema differs from the reviewed predecessor.')
    if own_free_bytes() < 2 * base.MAX_RELEASE + 2 * MAX_BACKUP:
        raise RuntimeError('Insufficient disk budget for private backups.')
    preservation(config)
    if base.own_state() != before_state:
        raise RuntimeError('Own configuration/database process changed.')
    base.receipt(work, {'status':'maintenance', 'commit':config['commit']})
    opened = installed = False
    before = objects = checksum = None
    previous = work / 'previous'
    live = base.DATA / 'release'
    try:
        base.run(['systemctl', 'stop', base.UNIT])
        if base.run(['systemctl', 'show', base.UNIT, '--property=MainPID', '--value']).strip() != b'0':
            raise RuntimeError('Own writer did not stop.')
        before, objects = database_snapshot(), objects_snapshot()
        checksum = backup(work)
        if file_tree(work / 'objects-backup') != objects:
            raise RuntimeError('Object backup verification failed.')
        validate_restore(work, before, checksum)
        base.receipt(work, {'status':'backed-up', 'commit':config['commit'], 'backup_sha256':checksum})
        migrate(candidate)
        verify_migration(candidate, before)
        if objects_snapshot() != objects:
            raise RuntimeError('Existing objects changed during migration.')
        preservation(config)
        if base.own_state() != before_state:
            raise RuntimeError('Configuration/database process changed.')
        live.rename(previous)
        candidate.rename(live)
        installed = True
        base.receipt(work, {'status':'opening', 'commit':config['commit'], 'backup_sha256':checksum})
        # From this point new writes may exist. Never restore the old dump automatically.
        opened = True
        base.run(['systemctl', 'start', base.UNIT])
        wait_ready(config['files'])
        preservation(config)
        if base.own_state() != before_state:
            raise RuntimeError('Configuration/database process changed.')
    except BaseException:
        rollback = False
        try:
            base.run(['systemctl', 'stop', base.UNIT])
            if not opened:
                if checksum is not None and before is not None and database_snapshot() != before:
                    restore(work, before, checksum)
                if before is not None and database_snapshot() != before:
                    raise RuntimeError('Pre-opening database return failed.')
                if installed:
                    live.rename(candidate)
                if previous.exists():
                    previous.rename(live)
                base.run(['systemctl', 'start', base.UNIT])
                wait_ready()
                preservation(config)
                rollback = base.own_state() == before_state
        except BaseException:
            rollback = False
        base.receipt(work, {'status':'failed', 'commit':config['commit'],
                            'rollback_verified':rollback, 'new_state_preserved':opened})
        raise RuntimeError('Transition failed; old release returned.' if rollback else
                           'Transition failed; own service stopped and state retained for review.') from None
    result = {'status':'published', 'commit':config['commit'], 'migrations_verified':True,
              'public_build_verified':True, 'preservation_checks_passed':True,
              'private_backup_retained':True, 'shared_services_restarted':False}
    base.receipt(work, result)
    # Retain the previous release and schema/object backups; never generic-prune them.
    return result


def remote_main(action):
    raw = sys.stdin.buffer.read(24 * 1024 * 1024 + 1)
    if len(raw) > 24 * 1024 * 1024:
        raise RuntimeError('Transition input budget exceeded.')
    config = json.loads(raw)
    base.validate(config)
    work = base.DATA / ('deployment-' + config['commit'])
    fd = os.open(base.DATA / 'deployment.lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'w') as handle:
        fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        preflight(config)
        if action == 'proxy':
            return proxy_change(config)
        if action == 'check':
            marker = work / 'result.json'
            if marker.is_file() and not marker.is_symlink():
                state = json.loads(marker.read_text())
                if state.get('status') == 'published' and state.get('commit') == config['commit']:
                    if file_tree(base.DATA / 'release/src') != {n[4:]:h for n,h in config['files'].items() if n.startswith('src/')}:
                        raise RuntimeError('Active source differs from publication receipt.')
                    healthy(config['files'])
                    return {'preflight_passed':True, 'already_active':True, 'commit':config['commit']}
            return {'preflight_passed':True, 'activated':False}
        if action == 'activate':
            return activate(config, work)
        if action != 'receive':
            raise RuntimeError('Invalid transition action.')
        if len(list(base.DATA.glob('deployment-*'))) >= 3:
            raise RuntimeError('Deployment workspace budget reached; preserve migration backups.')
        build = base64.b64decode(config['archive'], validate=True)
        if len(build) != config['archive_bytes'] or hashlib.sha256(build).hexdigest() != config['archive_sha256']:
            raise RuntimeError('Transition archive size/hash mismatch.')
        work.mkdir(mode=0o700)
        (work / 'build.tar.gz').write_bytes(build)
        return {'uploaded':True, 'activated':False}


def send(action, config, target, deploy):
    modules = []
    for name in ['deploy_sources', 'deploy_remote', 'deploy_blocks45', 'deploy_blocks67']:
        source = (Path(__file__).parent / (name + '.py')).read_text()
        if hashlib.sha256(source.encode()).hexdigest() != config['files'].get('infra/staging/' + name + '.py'):
            raise RuntimeError('Transition executor differs from exact CI commit.')
        modules.append((name, source))
    code = 'import sys,types; '
    for name, source in modules:
        code += 'm=types.ModuleType(' + repr(name) + ');sys.modules[' + repr(name) + ']=m;exec(' + repr(source) + ',m.__dict__);'
    code += 'import json;print(json.dumps(m.remote_main(sys.argv[1])))'
    properties = ['CPUQuota=10%', 'MemoryMax=192M', 'MemorySwapMax=0', 'TasksMax=32',
                  'Nice=19', 'IOSchedulingClass=idle', 'NoNewPrivileges=yes',
                  'ProtectSystem=strict', 'ProtectHome=yes', 'ReadWritePaths=' + str(base.DATA) + (' ' + str(PROXY) if action == 'proxy' else ''), 'RuntimeMaxSec=240']
    if action == 'proxy':
        # nginx -t opens logs and its PID path even without starting a master.
        # Shadow those paths in this validator only; retain the live PID/logs.
        properties += ['TemporaryFileSystem=/var/log/nginx:rw', 'BindPaths=/dev/null:/run/nginx.pid']
    args = ['systemd-run', '--quiet', '--wait', '--pipe', '--collect',
            '--unit=0xdmme-block67-' + action + '-' + config['commit'][:12], '--slice=xdmme-test.slice']
    for value in properties:
        args += ['-p', value]
    args += ['/usr/bin/python3', '-c', code, action]
    result = subprocess.run(['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10',
                             '-o', 'StrictHostKeyChecking=yes', target, shlex.join(args)],
                            input=json.dumps(config).encode(), capture_output=True, timeout=250)
    log = deploy.LOCAL / config['commit'] / ('blocks67-' + action + '.log')
    log.write_bytes((result.stdout + result.stderr)[-65536:])
    log.chmod(0o600)
    if result.returncode:
        raise RuntimeError('Transition ' + action + ' failed; inspect .local/ before retrying.')
    return json.loads(result.stdout.decode().strip().splitlines()[-1])


def prepare_local(revision, branch, deploy):
    return deploy.prepare(revision, branch)


def local_main():
    import argparse
    import deploy
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--check', action='store_true')
    mode.add_argument('--activate', action='store_true')
    args = parser.parse_args()
    revision, branch = deploy.repository()
    proof = deploy.ci(revision, branch)
    manifest, build = prepare_local(revision, branch, deploy)
    target, baseline = deploy.private_inputs()
    review = deploy.ROOT / '.local/VPS_BLOCK67_REVIEW.json'
    if review.is_symlink() or not review.is_file() or review.stat().st_mode & 0o077:
        raise RuntimeError('Private approved proxy/site review missing or permissions too broad.')
    deploy.run(['git', 'check-ignore', '--', str(review.relative_to(deploy.ROOT))])
    decision = json.loads(review.read_text())
    config = dict(manifest, baseline=baseline, **decision)
    deploy.run(['python3', 'infra/staging/sync-git.py'], timeout=150)
    checked = send('check', config, target, deploy)
    print(json.dumps(dict(checked, ci=proof)), flush=True)
    if args.check or checked.get('already_active'):
        return
    if deploy.repository()[0] != revision:
        raise RuntimeError('Checkout changed before sending transition.')
    print(json.dumps(send('proxy', config, target, deploy)), flush=True)
    send('receive', dict(config, archive=base64.b64encode(build.read_bytes()).decode()), target, deploy)
    print(json.dumps(send('activate', config, target, deploy)), flush=True)


if __name__ == '__main__':
    try:
        local_main()
    except Exception as error:
        print(json.dumps({'transition_failed':True, 'message':str(error) if isinstance(error, RuntimeError)
                          else 'Private transition error; inspect .local/ before retrying.'}))
        raise SystemExit(1)
