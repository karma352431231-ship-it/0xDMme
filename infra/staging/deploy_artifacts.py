"""Owned deployment workspaces, durable receipts and conservative artifact retention."""
import json
import os
import re
import shutil
from deploy_archive import digest

def receipt(work, data):
    temporary = work / 'result.tmp'
    with temporary.open('x') as handle:
        json.dump(data, handle)
        handle.flush()
        os.fsync(handle.fileno())
    temporary.replace(work / 'result.json')

def verified_code_failure(work, state):
    """Only unpublished code with a verified live rollback can be reclaimed."""
    if (state.get('status') != 'failed' or state.get('code_only') is not True
            or state.get('rollback_verified') is not True or state.get('workers_ready') is not True
            or state.get('commit') != work.name[len('deployment-'):]):
        return False
    names = set(p.name for p in work.iterdir())
    if (work.stat().st_uid != os.geteuid() or not {'build.tar.gz', 'result.json'}.issubset(names)
            or not names.issubset({'build.tar.gz', 'result.json', 'candidate'})
            or any(p.is_symlink() for p in work.iterdir())):
        raise RuntimeError('Failed code artifact requires manual review.')
    return True

def retain_migration_backup(work, old, *, data, archive_bytes):
    """Keep historical data backups; discard only reviewed completed code."""
    import deploy_blocks45 as backups
    required = {'build.tar.gz', 'previous', 'result.json', 'database.dump', 'objects-backup'}
    if old.get('capacity_schema_versions') == 90:
        required.add('capacity-proxy-before.conf')
        proxy_backup = work / 'capacity-proxy-before.conf'
        if (proxy_backup.is_symlink() or not proxy_backup.is_file()
                or not 0 < proxy_backup.stat().st_size <= 16384
                or digest(proxy_backup) != old.get('capacity_proxy_before_sha256')):
            raise RuntimeError('Historical capacity proxy backup differs from its receipt.')
    entries = set(p.name for p in work.iterdir())
    if not required.issubset(entries) or not entries.issubset(required | {'qr.tar.gz'}):
        raise RuntimeError('Completed transition contents require manual review.')
    if work.stat().st_uid != os.geteuid() or any(p.is_symlink() for p in work.iterdir()):
        raise RuntimeError('Completed transition ownership/link requires review.')
    dump = work / 'database.dump'
    if not dump.is_file() or dump.stat().st_size <= 0:
        raise RuntimeError('Historical database backup is missing or irregular.')
    for name, limit in [('build.tar.gz',archive_bytes),
                        ('result.json',65536), ('qr.tar.gz',2 * 1024 * 1024)]:
        path = work / name
        if path.exists() and (not path.is_file() or path.stat().st_size > limit):
            raise RuntimeError('Completed transition artifact budget/type differs.')
    objects, previous = work / 'objects-backup', work / 'previous'
    if not objects.is_dir() or not previous.is_dir():
        raise RuntimeError('Completed transition directories differ.')
    backups.file_tree(objects)
    allowed = {'src', 'infra', 'dist', 'node_modules', 'package.json', 'package-lock.json', '.nvmrc'}
    if not set(p.name for p in previous.iterdir()).issubset(allowed):
        raise RuntimeError('Old rollback contents require manual review.')
    archive = data / 'migration-backups'
    if archive.is_symlink() or (archive.exists() and not archive.is_dir()):
        raise RuntimeError('Historical backup directory requires review.')
    archive.mkdir(mode=0o700, exist_ok=True)
    if archive.stat().st_uid != os.geteuid() or archive.stat().st_mode & 0o077:
        raise RuntimeError('Historical backup permissions differ.')
    destination = archive / old['commit']
    if destination.exists() or destination.is_symlink():
        raise RuntimeError('Historical backup already exists; review interrupted cleanup.')
    # Move the complete bundle first. Even interrupted code cleanup retains
    # dump, objects and receipt together; bounded disk checks still apply.
    work.rename(destination)
    shutil.rmtree(destination / 'previous')
    (destination / 'build.tar.gz').unlink()
    for directory in [destination, archive, data]:
        fd = os.open(directory, os.O_RDONLY)
        try:
            os.fsync(fd)
        finally:
            os.close(fd)



def retain_failure_receipt(state, *, data):
    """Keep 16 small failure records; local builds and pushed Git remain recoverable."""
    if not re.fullmatch(r'[a-f0-9]{40}', state.get('commit', '')):
        raise RuntimeError('Failure receipt commit differs.')
    directory = data / 'release-failures'
    if directory.is_symlink():
        raise RuntimeError('Failure receipt path requires review.')
    directory.mkdir(exist_ok=True, mode=0o700)
    records = []
    for path in directory.iterdir():
        if (path.is_symlink() or not path.is_file() or path.stat().st_uid != os.geteuid()
                or not re.fullmatch(r'[a-f0-9]{40}\.json', path.name) or path.stat().st_size > 16384):
            raise RuntimeError('Failure receipt inventory requires review.')
        records.append(path)
        if len(records) > 16:
            raise RuntimeError('Failure receipt budget exceeded.')
    destination = directory / (state['commit'] + '.json')
    encoded = json.dumps(state).encode()
    if len(encoded) > 16384:
        raise RuntimeError('Failure receipt budget requires review.')
    if destination.exists():
        if destination.read_bytes() != encoded:
            raise RuntimeError('Failure receipt collision requires review.')
        return
    for path in sorted(records, key=lambda p:p.stat().st_mtime_ns)[:max(0, len(records) - 15)]:
        path.unlink()
    descriptor = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(descriptor, 'wb') as handle:
        handle.write(encoded)
        handle.flush()
        os.fsync(handle.fileno())



def prune_completed(current, dry_run=False, *, data, archive_bytes):
    # Only workspaces made by this command; the current workspace keeps the previous release.
    transitions = []
    for work in data.glob('deployment-*'):
        marker = work / 'result.json'
        if (work.is_dir() and not work.is_symlink() and
                re.fullmatch(r'deployment-[a-f0-9]{40}', work.name) and
                marker.is_file() and not marker.is_symlink()):
            old = json.loads(marker.read_text())
            if (old.get('status') == 'published' and old.get('private_backup_retained') is True and
                    old.get('commit') == work.name[len('deployment-'):]):
                transitions.append((marker.stat().st_mtime_ns, work))
    # Preserve the newest transition's full rollback until another publication
    # has succeeded. Historical data backups never enter the code-workspace cap.
    newest = max(transitions, key=lambda entry:entry[0])[1] if transitions else None
    removed = 0
    for work in data.glob('deployment-*'):
        if work == current or work.is_symlink() or not work.is_dir():
            continue
        if not re.fullmatch(r'deployment-[a-f0-9]{40}', work.name):
            continue
        marker = work / 'result.json'
        if not marker.is_file() or marker.is_symlink():
            continue
        old = json.loads(marker.read_text())
        if verified_code_failure(work, old):
            if not dry_run:
                retain_failure_receipt(old, data=data)
                shutil.rmtree(work)
            removed += 1
            continue
        if old.get('status') != 'published' or old.get('commit') != work.name[len('deployment-'):]:
            continue
        if old.get('private_backup_retained') is True:
            if work != newest:
                if not dry_run:
                    retain_migration_backup(work, old, data=data, archive_bytes=archive_bytes)
                removed += 1
            continue
        if work.stat().st_uid != os.geteuid() or set(p.name for p in work.iterdir()) != {'build.tar.gz', 'previous', 'result.json'}:
            raise RuntimeError('Old deployment workspace requires manual review; new release remains active.')
        previous = work / 'previous'
        if previous.is_symlink() or not previous.is_dir():
            raise RuntimeError('Old rollback path requires manual review; new release remains active.')
        allowed = {'src', 'infra', 'dist', 'node_modules', 'package.json', 'package-lock.json', '.nvmrc'}
        if not set(p.name for p in previous.iterdir()).issubset(allowed):
            raise RuntimeError('Old rollback contents require manual review; new release remains active.')
        if not dry_run:
            shutil.rmtree(work)
        removed += 1
    return removed



def retention_capacity(current, *, data, archive_bytes):
    reclaimable = prune_completed(current, dry_run=True, data=data, archive_bytes=archive_bytes)
    if len(list(data.glob('deployment-*'))) - reclaimable >= 3:
        raise RuntimeError('Deployment retention budget reached; review own old artifacts before upload.')
