"""Exact legacy/root-resident worker layouts and durable six-path exchange."""
import os
from pathlib import Path
import stat

import deploy_remote as base

ROLES = ('ranking', 'content', 'public')
UNITS = tuple('0xdmme-' + role + '-worker.service' for role in ROLES)
SYSTEM = Path('/etc/systemd/system')


def root_device():
    return Path('/').stat().st_dev


def root_metadata(info, device):
    if (not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_gid != 0
            or stat.S_IMODE(info.st_mode) != 0o644 or info.st_nlink != 1
            or info.st_dev != device):
        raise RuntimeError('Worker root unit metadata differs from review.')


def detect(system, volume):
    if system.is_symlink() or not system.is_dir():
        raise RuntimeError('Worker unit directory differs.')
    wants = system / 'multi-user.target.wants'
    if wants.is_symlink() or not wants.is_dir():
        raise RuntimeError('Worker wants directory differs.')
    kinds = []
    for unit in UNITS:
        path, enabled, original = system / unit, wants / unit, volume / unit
        if original.is_symlink() or not original.is_file():
            raise RuntimeError('Worker original definition differs.')
        if path.is_symlink() and str(path.readlink()) == str(original):
            kind, target = 'volume', str(original)
        elif path.is_file() and not path.is_symlink():
            root_metadata(path.lstat(), root_device())
            kind, target = 'root', '../' + unit
        else:
            raise RuntimeError('Worker unit layout differs.')
        if not enabled.is_symlink() or str(enabled.readlink()) != target:
            raise RuntimeError('Worker wants layout differs.')
        kinds.append(kind)
    if len(set(kinds)) != 1:
        raise RuntimeError('Worker unit layout differs: mixed state requires review.')
    return kinds[0]


def sync_directory(path):
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def replace_definition(path, content):
    temporary = path.with_name('.' + path.name + '.worker-boot')
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        with os.fdopen(fd, 'wb') as handle:
            os.fchown(handle.fileno(), 0, 0)
            os.fchmod(handle.fileno(), 0o644)
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
        sync_directory(path.parent)
    finally:
        temporary.unlink(missing_ok=True)


def replace_link(path, target):
    temporary = path.with_name('.' + path.name + '.worker-boot')
    temporary.symlink_to(target)
    try:
        os.replace(temporary, path)
        sync_directory(path.parent)
    finally:
        temporary.unlink(missing_ok=True)


def snapshot(system, volume):
    if detect(system, volume) != 'volume':
        raise RuntimeError('Worker boot transition requires the complete legacy layout.')
    return {unit: {'definition': str((system / unit).readlink()),
                   'wants': str((system / 'multi-user.target.wants' / unit).readlink()),
                   'sha256': base.digest(volume / unit)} for unit in UNITS}


def install(system, volume, before):
    for unit in UNITS:
        path, enabled = system / unit, system / 'multi-user.target.wants' / unit
        if (not path.is_symlink() or str(path.readlink()) != before[unit]['definition']
                or not enabled.is_symlink() or str(enabled.readlink()) != before[unit]['wants']
                or base.digest(volume / unit) != before[unit]['sha256']):
            raise RuntimeError('Worker paths changed before exchange.')
        replace_definition(path, (volume / unit).read_bytes())
        replace_link(enabled, '../' + unit)


def restore(system, volume, before):
    # Validate every preimage first. Never overwrite an unexpected administrator edit.
    for unit in UNITS:
        path, enabled = system / unit, system / 'multi-user.target.wants' / unit
        if base.digest(volume / unit) != before[unit]['sha256']:
            raise RuntimeError('Worker rollback original bytes changed.')
        if path.is_symlink():
            if str(path.readlink()) != before[unit]['definition']:
                raise RuntimeError('Worker rollback definition changed.')
        else:
            root_metadata(path.lstat(), root_device())
            if base.digest(path) != before[unit]['sha256']:
                raise RuntimeError('Worker rollback definition bytes changed.')
        if not enabled.is_symlink() or str(enabled.readlink()) not in [before[unit]['wants'], '../' + unit]:
            raise RuntimeError('Worker rollback wants link changed.')
    for unit in UNITS:
        replace_link(system / unit, before[unit]['definition'])
        replace_link(system / 'multi-user.target.wants' / unit, before[unit]['wants'])
    if detect(system, volume) != 'volume':
        raise RuntimeError('Worker rollback layout not restored.')
