"""Explicit owner-reviewed block 04–05 transition; ordinary deploy stays strict."""

import argparse
import base64
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

import deploy_remote as base

BEFORE = 'd64711c0cdcb3024c6728e4328190d545988333e'
REVIEWED = '203274bb8dac5031a0697cf892c4b96f7d7600ac'
QR_TREE = '8a55ad125d65d832ae60b9cf6499e1898c4c9034624708c2f1362f9daa2fc389'
MAX_BACKUP = 64 * 1024 * 1024
OLD_TABLES = ('accounts', 'login_devices', 'login_challenges', 'login_sessions',
              'login_handoffs', 'service_metadata')


def file_tree(root):
    files = {}
    for path in sorted(root.rglob('*')):
        if path.is_symlink():
            raise RuntimeError('Reviewed tree contains an unexpected link.')
        if path.is_file():
            files[str(path.relative_to(root))] = base.digest(path)
        if len(files) > 512:
            raise RuntimeError('Reviewed tree budget exceeded.')
    return files


def qr_tree(root):
    files = file_tree(root)
    if (not files or sum(p.stat().st_size for p in root.rglob('*') if p.is_file()) > 2 * 1024 * 1024
            or hashlib.sha256(json.dumps(files, sort_keys=True, separators=(',', ':')).encode()).hexdigest() != QR_TREE):
        raise RuntimeError('QR package differs from the reviewed Mac package.')


def git_export(revision):
    blob = base.run(['git', '--git-dir=' + str(base.DATA / 'git/0xdmme.git'),
                     'archive', revision, 'src', 'package.json', 'package-lock.json', '.nvmrc'])
    with tarfile.open(fileobj=io.BytesIO(blob)) as archive:
        return {m.name: archive.extractfile(m).read() for m in archive.getmembers() if m.isfile()}


def matches_export(root, files, source_only=False):
    expected = {name: hashlib.sha256(value).hexdigest() for name, value in files.items()
                if not source_only or name.startswith('src/')}
    actual = {'src/' + name: value for name, value in file_tree(root / 'src').items()}
    if not source_only:
        actual.update({name: base.digest(root / name) for name in files if not name.startswith('src/')})
    return actual == expected


def reviewed_candidate(candidate, live):
    previous, approved = git_export(BEFORE), git_export(REVIEWED)
    if not matches_export(live, previous):
        raise RuntimeError('Live release differs from the reviewed predecessor.')
    if not matches_export(candidate, approved, source_only=True):
        raise RuntimeError('Application sources differ from the reviewed blocks 04–05.')
    for name in ['package-lock.json', '.nvmrc']:
        if (candidate / name).read_bytes() != approved[name]:
            raise RuntimeError('Incoming dependency/Node contract differs from the review.')
    incoming = json.loads((candidate / 'package.json').read_text())
    expected = json.loads(approved['package.json'])
    # Only this explicit command is added to the already-reviewed package scripts.
    expected['scripts']['deploy:blocks45'] = 'python3 infra/staging/deploy_blocks45.py --activate'
    if incoming != expected:
        raise RuntimeError('Incoming package contract differs from the approved transition.')
    # Preserve the ordinary executor's Node validation without permitting DB/lock changes there.
    constraint = incoming['engines']['node']
    import re
    match = re.fullmatch(r'>=(\d+)\.(\d+)\.(\d+) <(\d+)', constraint)
    installed = re.fullmatch(r'v(\d+)\.(\d+)\.(\d+)', base.run(['/usr/bin/node', '--version']).decode().strip())
    if not match or not installed:
        raise RuntimeError('Node contract could not be verified.')
    actual = tuple(int(installed[i]) for i in [1, 2, 3])
    if actual < tuple(int(match[i]) for i in [1, 2, 3]) or actual >= (int(match[4]), 0, 0):
        raise RuntimeError('Installed Node is outside the unchanged approved range.')


def prepare_candidate(config, work):
    blob = base.run(['git', '--git-dir=' + str(base.DATA / 'git/0xdmme.git'), 'archive',
                     config['commit'], 'src', 'infra', 'package.json', 'package-lock.json', '.nvmrc'])
    candidate = work / 'candidate'
    candidate.mkdir(mode=0o755)
    with tarfile.open(fileobj=io.BytesIO(blob)) as archive:
        base.extract(archive, candidate, ['src', 'infra', 'package.json', 'package-lock.json', '.nvmrc'])
    with tarfile.open(work / 'build.tar.gz') as archive:
        base.extract(archive, candidate, ['dist'])
    if file_tree(candidate) != config['files']:
        raise RuntimeError('Git source/build manifest mismatch.')
    reviewed_candidate(candidate, base.DATA / 'release')
    dependencies = base.DATA / 'release/node_modules'
    count = size = 0
    for path in dependencies.rglob('*'):
        count += 1
        if path.is_symlink() and not path.resolve().is_relative_to(dependencies):
            raise RuntimeError('Runtime dependency link escapes its directory.')
        if path.is_file():
            size += path.stat().st_size
        if count > 4096 or size > base.MAX_RELEASE - 2 * 1024 * 1024:
            raise RuntimeError('Runtime dependency budget exceeded.')
    shutil.copytree(dependencies, candidate / 'node_modules', symlinks=True)
    if (candidate / 'node_modules/qr').exists():
        raise RuntimeError('Unexpected QR package in predecessor.')
    with tarfile.open(work / 'qr.tar.gz') as archive:
        members = archive.getmembers()
        if (not members or len(members) > 128 or sum(m.size for m in members) > 2 * 1024 * 1024
                or any(m.name != 'node_modules/qr' and not m.name.startswith('node_modules/qr/') for m in members)):
            raise RuntimeError('QR archive contains unrelated paths.')
        base.extract(archive, candidate, ['node_modules'])
    qr_tree(candidate / 'node_modules/qr')
    for path in [candidate, *candidate.rglob('*')]:
        if path.is_symlink():
            os.lchown(path, 0, 0)
        else:
            os.chown(path, 0, 0)
            os.chmod(path, 0o755 if path.is_dir() or path.stat().st_mode & 0o111 else 0o644)
    return candidate


def database_process():
    pid = int(base.run(['systemctl', 'show', '0xdmme-postgres-test.service', '--property=MainPID', '--value']).strip())
    if pid <= 1:
        raise RuntimeError('Own database service is unavailable.')
    return pid


def node(code):
    return base.run(['nsenter', '--target', str(database_process()), '--net', '/usr/bin/node',
                     '--max-old-space-size=64', '--env-file=/etc/0xdmme/web.env',
                     '--input-type=module', '-e', code], timeout=30)


URL_CHECK = """
const url = new URL(process.env.HASH_TALK_DATABASE_URL);
if(url.hostname!=='127.0.0.1'||url.port!=='45433'||url.pathname!=='/hash_talk_stage'||url.username!=='hash_talk_stage') throw new Error('Own database contract differs.');
"""


def database_snapshot(tables=OLD_TABLES, *, omit_columns=None):
    if not tables or any(not name.replace('_', '').isalnum() for name in tables):
        raise RuntimeError('Invalid snapshot table contract.')
    omit_columns = omit_columns or {}
    if any(name not in tables or not isinstance(columns, (list, tuple)) or
           any(not isinstance(column, str) or not re.fullmatch(r'[a-z][a-z0-9_]*', column)
               for column in columns) for name, columns in omit_columns.items()):
        raise RuntimeError('Invalid snapshot column contract.')
    omitted = json.dumps(omit_columns)
    tables = json.dumps(tables)
    result = node("""
import { createRequire } from 'node:module';
const pg = createRequire('/var/lib/0xdmme/data/release/package.json')('pg');
""" + URL_CHECK + """
const client = new pg.Client({connectionString:url.href,connectionTimeoutMillis:3000,query_timeout:5000,statement_timeout:4000});
try {
 await client.connect(); await client.query('BEGIN READ ONLY');
 const result={tables:{},versions:(await client.query('SELECT version,checksum FROM hash_talk.schema_migrations ORDER BY version LIMIT 64')).rows};
 const bytes=Number((await client.query('SELECT pg_database_size(current_database())::text AS bytes')).rows[0].bytes);
 if(bytes>67108864) throw new Error('Database backup budget exceeded.');
 const omitted=""" + omitted + """;
 for(const name of """ + tables + """) {
  const count=Number((await client.query('SELECT count(*)::integer AS count FROM hash_talk.'+name)).rows[0].count);
  if(count>10000) throw new Error('Snapshot row budget exceeded.');
  // Compare digests only; wallet addresses, tokens and opaque profile bytes never leave this process.
  result.tables[name]=(await client.query("SELECT count(*)::integer AS count,md5(coalesce(string_agg(value::text,'' ORDER BY value::text),'')) AS hash FROM (SELECT to_jsonb(t)-$1::text[] AS value FROM hash_talk."+name+" t) snapshot_rows",[['reserved_bytes',...(omitted[name]??[])]] )).rows[0];
 }
 await client.query('ROLLBACK'); console.log(JSON.stringify(result));
} finally {await client.end();}
""")
    return json.loads(result)


def pg_environment():
    # Credentials stay in private process memory, never argv, logs, Git or stdout to the operator.
    values = json.loads(node(URL_CHECK + "console.log(JSON.stringify({PGPASSWORD:decodeURIComponent(url.password)}));"))
    return dict(PATH='/usr/bin:/bin', PGHOST='127.0.0.1', PGPORT='45433',
                PGUSER='hash_talk_stage', PGDATABASE='hash_talk_stage', **values)


def pg(args, *, input=None):
    def limits():
        resource.setrlimit(resource.RLIMIT_FSIZE, (MAX_BACKUP, MAX_BACKUP))
    return subprocess.run(['nsenter', '--target', str(database_process()), '--net',
                           '/usr/lib/postgresql/16/bin/' + args[0], *args[1:]],
                          env=pg_environment(), input=input, capture_output=True,
                          timeout=45, check=True, preexec_fn=limits).stdout


def objects_snapshot():
    root = base.DATA / 'objects/content'
    files = file_tree(root)
    if sum((root / name).stat().st_size for name in files) > MAX_BACKUP:
        raise RuntimeError('Object backup budget exceeded.')
    return files


def backup(work):
    dump = work / 'database.dump'
    pg(['pg_dump', '--format=custom', '--no-owner', '--no-acl', '--schema=hash_talk',
        '--lock-wait-timeout=2s', '--file=' + str(dump)])
    if dump.is_symlink() or not 0 < dump.stat().st_size <= MAX_BACKUP:
        raise RuntimeError('Database backup budget exceeded.')
    dump.chmod(0o600)
    with dump.open('rb') as handle:
        os.fsync(handle.fileno())
    listing = pg(['pg_restore', '--list', str(dump)])
    if b'TABLE hash_talk accounts ' not in listing or b'TABLE hash_talk schema_migrations ' not in listing:
        raise RuntimeError('Database backup is incomplete.')
    # Parse/decompress the whole backup before any migration, discarding its SQL privately.
    pg(['pg_restore', '--no-owner', '--no-acl', '--file=/dev/null', str(dump)])
    shutil.copytree(base.DATA / 'objects/content', work / 'objects-backup')
    for path in (work / 'objects-backup').rglob('*'):
        if path.is_file():
            with path.open('rb') as handle:
                os.fsync(handle.fileno())
    for path in [work / 'objects-backup', work]:
        fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(fd)
        finally:
            os.close(fd)
    return base.digest(dump)


def migrate(candidate):
    module = json.dumps((candidate / 'src/server/database/index.ts').as_uri())
    node(URL_CHECK + "const {Database}=await import(" + module + ");const db=new Database(url.href,Number(process.env.HASH_TALK_ACCOUNT_CAPACITY_BYTES));try{await db.migrate();}finally{await db.close();}")


def verify_migration(candidate, before):
    after = database_snapshot()
    expected = [{'version':i + 1, 'checksum':base.digest(path)} for i, path in
                enumerate(sorted((candidate / 'src/server/database/migrations').glob('*.sql')))]
    if after['tables'] != before['tables'] or after['versions'] != expected:
        raise RuntimeError('Migration failed preservation/checksum verification.')
    consistent = pg(['psql', '--no-psqlrc', '--set=ON_ERROR_STOP=1', '--tuples-only', '--no-align', '-c',
                     "SELECT used_bytes=coalesce((SELECT sum(octet_length(profile_ciphertext)+524) FROM hash_talk.accounts),0) "
                     "AND NOT EXISTS(SELECT 1 FROM hash_talk.vault_operations) "
                     "AND NOT EXISTS(SELECT 1 FROM hash_talk.vault_heads) "
                     "AND to_regclass('hash_talk.account_capacity') IS NULL "
                     "FROM hash_talk.content_usage WHERE singleton"])
    if consistent.strip() != b't':
        raise RuntimeError('Initial actual-use ledger is inconsistent.')


def restore_sql(work, checksum):
    if base.digest(work / 'database.dump') != checksum:
        raise RuntimeError('Backup digest changed; restore refused.')
    sql = pg(['pg_restore', '--no-owner', '--no-acl', '--file=-', str(work / 'database.dump')])
    if len(sql) > MAX_BACKUP:
        raise RuntimeError('Restore SQL budget exceeded.')
    return sql


def validate_restore(work, expected, checksum, *, snapshot=None):
    sql = restore_sql(work, checksum)
    # Exercise DDL, COPY and constraints while our writer is stopped, then roll back everything.
    pg(['psql', '--no-psqlrc', '--set=ON_ERROR_STOP=1', '--quiet'],
       input=b'BEGIN; DROP SCHEMA hash_talk CASCADE;\n' + sql + b'\nROLLBACK;\n')
    if (snapshot or database_snapshot)() != expected:
        raise RuntimeError('Restore rehearsal did not preserve the original database.')


def restore(work, expected, checksum, *, snapshot=None):
    sql = restore_sql(work, checksum)
    # Only our schema, in one transaction. Never restore after reopening the writer.
    pg(['psql', '--no-psqlrc', '--set=ON_ERROR_STOP=1', '--quiet'],
       input=b'BEGIN; DROP SCHEMA hash_talk CASCADE;\n' + sql + b'\nCOMMIT;\n')
    if (snapshot or database_snapshot)() != expected:
        raise RuntimeError('Database return could not be verified.')


def activate(config, work):
    before_state = base.preflight(config)
    if not work.is_dir() or work.is_symlink() or (work / 'result.json').exists():
        raise RuntimeError('Interrupted/completed transition requires review; never blindly retry.')
    for name, checksum in [('build.tar.gz', config['archive_sha256']), ('qr.tar.gz', config['qr_sha256'])]:
        if base.digest(work / name) != checksum:
            raise RuntimeError('Transition archive digest mismatch.')
    candidate = prepare_candidate(config, work)
    if own_free_bytes() < 2 * base.MAX_RELEASE + 2 * MAX_BACKUP:
        raise RuntimeError('Insufficient disk budget for private backups.')
    base.preservation(config['baseline'])
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
        base.preservation(config['baseline'])
        if base.own_state() != before_state:
            raise RuntimeError('Configuration/database process changed.')
        live.rename(previous)
        candidate.rename(live)
        installed = True
        base.receipt(work, {'status':'opening', 'commit':config['commit'], 'backup_sha256':checksum})
        # From this point new writes may exist. Never restore the old dump automatically.
        opened = True
        base.run(['systemctl', 'start', base.UNIT])
        base.wait_ready(config['files'])
        base.preservation(config['baseline'])
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
                base.wait_ready()
                base.preservation(config['baseline'])
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
    base.prune_completed(work)
    return result


def own_free_bytes():
    stats = os.statvfs(base.DATA)
    return stats.f_bavail * stats.f_frsize


def remote_main(action):
    raw = sys.stdin.buffer.read(24 * 1024 * 1024 + 1)
    if len(raw) > 24 * 1024 * 1024:
        raise RuntimeError('Transition input budget exceeded.')
    config = json.loads(raw)
    base.validate(config)
    work = base.DATA / ('deployment-' + config['commit'])
    if action == 'check':
        base.preflight(config)
        marker = work / 'result.json'
        if marker.is_file() and not marker.is_symlink():
            state = json.loads(marker.read_text())
            if state.get('status') == 'published' and state.get('commit') == config['commit']:
                current = all((base.DATA / 'release' / name).is_file() and
                              base.digest(base.DATA / 'release' / name) == checksum
                              for name, checksum in config['files'].items())
                if current:
                    base.healthy(config['files'])
                    return {'preflight_passed':True, 'already_active':True, 'commit':config['commit']}
        return {'preflight_passed':True, 'activated':False}
    if action not in ['receive', 'activate']:
        raise RuntimeError('Invalid transition action.')
    fd = os.open(base.DATA / 'deployment.lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'w') as handle:
        fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        base.preflight(config)
        if action == 'activate':
            return activate(config, work)
        if len(list(base.DATA.glob('deployment-*'))) >= 3:
            raise RuntimeError('Deployment workspace budget reached.')
        build = base64.b64decode(config['archive'], validate=True)
        qr = base64.b64decode(config['qr_archive'], validate=True)
        if (len(build) != config['archive_bytes'] or hashlib.sha256(build).hexdigest() != config['archive_sha256']
                or not 0 < len(qr) <= 2 * 1024 * 1024 or hashlib.sha256(qr).hexdigest() != config['qr_sha256']):
            raise RuntimeError('Transition archive size/hash mismatch.')
        work.mkdir(mode=0o700)
        (work / 'build.tar.gz').write_bytes(build)
        (work / 'qr.tar.gz').write_bytes(qr)
        return {'uploaded':True, 'activated':False}


def send(action, config, target, deploy):
    source = Path(__file__).read_text()
    base_source = (Path(__file__).parent / 'deploy_remote.py').read_text()
    source_helper = (Path(__file__).parent / 'deploy_sources.py').read_text()
    for name, code in [('infra/staging/deploy_blocks45.py', source), ('infra/staging/deploy_remote.py', base_source),
                       ('infra/staging/deploy_sources.py', source_helper)]:
        if hashlib.sha256(code.encode()).hexdigest() != config['files'].get(name):
            raise RuntimeError('Transition executor differs from the exact CI commit.')
    code = ("import sys,types; helper=types.ModuleType('deploy_sources'); exec(" + repr(source_helper) +
            ",helper.__dict__); sys.modules['deploy_sources']=helper; module=types.ModuleType('deploy_remote'); exec(" +
            repr(base_source) + ",module.__dict__); sys.modules['deploy_remote']=module; exec(" + repr(source) + ")")
    command = shlex.join(['systemd-run', '--quiet', '--wait', '--pipe', '--collect',
                         '--unit=0xdmme-transition-' + action + '-' + config['commit'][:12],
                         '--slice=xdmme-test.slice', '-p', 'CPUQuota=10%', '-p', 'MemoryMax=192M',
                         '-p', 'MemorySwapMax=0', '-p', 'TasksMax=32', '-p', 'Nice=19',
                         '-p', 'IOSchedulingClass=idle', '-p', 'NoNewPrivileges=yes',
                         '-p', 'ProtectSystem=strict', '-p', 'ProtectHome=yes',
                         '-p', 'ReadWritePaths=/var/lib/0xdmme/data', '-p', 'RuntimeMaxSec=240',
                         '/usr/bin/python3', '-c', code, 'remote-' + action])
    result = subprocess.run(['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10',
                             '-o', 'StrictHostKeyChecking=yes', target, command],
                            input=json.dumps(config).encode(), capture_output=True, timeout=250)
    log = deploy.LOCAL / config['commit'] / ('transition-' + action + '.log')
    log.write_bytes((result.stdout + result.stderr)[-65536:])
    log.chmod(0o600)
    if result.returncode:
        raise RuntimeError('Transition ' + action + ' failed; inspect .local/ before retrying.')
    return json.loads(result.stdout.decode().strip().splitlines()[-1])


def local_main():
    import deploy
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--check', action='store_true')
    mode.add_argument('--activate', action='store_true')
    args = parser.parse_args()
    revision, branch = deploy.repository()
    proof = deploy.ci(revision, branch)
    manifest, build = deploy.prepare(revision, branch)
    qr_tree(deploy.ROOT / 'node_modules/qr')
    qr_path = build.with_name('qr.tar.gz')
    with tarfile.open(qr_path, 'w:gz') as archive:
        archive.add(deploy.ROOT / 'node_modules/qr', arcname='node_modules/qr')
    qr_path.chmod(0o600)
    target, baseline = deploy.private_inputs()
    config = dict(manifest, baseline=baseline, qr_sha256=base.digest(qr_path))
    deploy.run(['python3', 'infra/staging/sync-git.py'], timeout=150)
    checked = send('check', config, target, deploy)
    print(json.dumps(checked), flush=True)
    if args.check or checked.get('already_active'):
        return
    if deploy.repository()[0] != revision:
        raise RuntimeError('Checkout changed before sending the transition.')
    send('receive', dict(config, archive=base64.b64encode(build.read_bytes()).decode(),
                         qr_archive=base64.b64encode(qr_path.read_bytes()).decode()), target, deploy)
    print(json.dumps(send('activate', config, target, deploy)), flush=True)


if __name__ == '__main__':
    try:
        if len(sys.argv) == 2 and sys.argv[1].startswith('remote-'):
            print(json.dumps(remote_main(sys.argv[1][7:])))
        else:
            local_main()
    except Exception as error:
        print(json.dumps({'transition_failed':True, 'message':str(error) if isinstance(error, RuntimeError)
                          else 'Private transition error; inspect .local/ before retrying.'}))
        raise SystemExit(1)
