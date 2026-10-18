"""Explicitly reviewed worker definition relocation, through deploy.py only."""
import json
import os
from pathlib import Path
import re
import subprocess
import time

import deploy_remote as base
import deploy_background as background
import deploy_worker_layout as layout
import deploy_worker_readiness as readiness


def validate(config):
    proposal = config.get('worker_boot')
    if (not isinstance(proposal, dict) or set(proposal) != {'commit', 'unit_sha256'}
            or not isinstance(proposal['commit'], str) or proposal['commit'] != config['commit'] or not re.fullmatch(r'[a-f0-9]{40}', proposal['commit'])
            or not isinstance(proposal['unit_sha256'], dict) or set(proposal['unit_sha256']) != set(layout.UNITS)):
        raise RuntimeError('Exact private worker-boot review required.')
    for unit, checksum in proposal['unit_sha256'].items():
        if not isinstance(checksum, str) or not re.fullmatch(r'[a-f0-9]{64}', checksum) or config['files'].get('infra/staging/' + unit) != checksum:
            raise RuntimeError('Worker-boot review changes unit bytes or scope.')


def configure(config, private_root):
    path = private_root / '.local/VPS_WORKER_BOOT_REVIEW.json'
    if path.is_symlink() or not path.is_file() or path.stat().st_mode & 0o077 or path.stat().st_size > 4096:
        raise RuntimeError('Private worker-boot review missing or unsafe.')
    subprocess.run(['git', 'check-ignore', '--', str(path.relative_to(private_root))],
                   cwd=private_root, capture_output=True, check=True, timeout=5)
    config['worker_boot'] = json.loads(path.read_text())
    validate(config)


def review(config):
    validate(config)
    kind = background.verify_current(config)
    if not background.ready():
        raise RuntimeError('Own workers not ready; refusing maintenance.')
    return kind


def record(path, value):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'w') as handle:
        json.dump(value, handle)
        handle.flush()
        os.fsync(handle.fileno())
    layout.sync_directory(path.parent)


def other_services():
    names = ('test', 'postgres-test', 'media', 'push', 'turn')
    return {name: base.run(['systemctl', 'show', '0xdmme-' + name + '.service',
                           '--property=MainPID,ActiveState,LoadState,NRestarts,ExecMainStartTimestampMonotonic'], timeout=2).decode()
            for name in names}


def verified(config, before, others):
    base.preservation(config['baseline'])
    base.healthy()
    if base.own_state() != before or other_services() != others or not background.ready():
        raise RuntimeError('Worker-boot preservation/readiness differs.')
    background.verify_current(config)


def restart_one(role):
    others = tuple(value for value in layout.ROLES if value != role)
    before = {value: readiness.status(value) for value in others}
    if not readiness.ready(others):
        raise RuntimeError('Untouched workers are not ready.')
    base.run(['systemctl', 'restart', '0xdmme-' + role + '-worker.service'], timeout=15)
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        if ({value: readiness.status(value) for value in others} != before or not readiness.ready(others)):
            raise RuntimeError('Untouched worker changed during restart.')
        if readiness.ready((role,)):
            return
        time.sleep(1)
    raise RuntimeError('Own worker did not regain its exact lease.')


def return_workers():
    for role in layout.ROLES:
        if not readiness.ready((role,)):
            base.run(['systemctl', 'start', '0xdmme-' + role + '-worker.service'], timeout=15)
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        if background.ready():
            return
        time.sleep(1)
    raise RuntimeError('Own workers did not return to readiness.')


def change(config, work):
    if os.geteuid() != 0:
        raise RuntimeError('Root-owned worker transition required.')
    kind = review(config)
    base.preservation(config['baseline'])
    before, others = base.own_state(), other_services()
    marker = work / 'result.json'
    if work.is_symlink():
        raise RuntimeError('Worker-boot evidence path differs.')
    if kind == 'root':
        if marker.is_symlink() or not marker.is_file() or marker.stat().st_size > 4096:
            raise RuntimeError('Root worker layout has no verified receipt.')
        result = json.loads(marker.read_text())
        if result.get('status') != 'configured' or result.get('commit') != config['commit'] or result.get('unit_sha256') != config['worker_boot']['unit_sha256']:
            raise RuntimeError('Worker-boot receipt differs.')
        verified(config, before, others)
        return dict(result, already_configured=True)
    if work.exists():
        raise RuntimeError('Previous worker-boot attempt requires review.')
    work.mkdir(mode=0o700)
    original = layout.snapshot(layout.SYSTEM, background.UNIT_ROOT)
    record(work / 'before.json', {'paths': original, 'own_state': before, 'other_services': others})
    try:
        layout.install(layout.SYSTEM, background.UNIT_ROOT, original)
        if review_layout(config) != 'root':
            raise RuntimeError('Root worker layout not established.')
        base.run(['systemd-analyze', 'verify', *(str(layout.SYSTEM / unit) for unit in layout.UNITS)], timeout=15)
        base.run(['systemctl', 'daemon-reload'], timeout=15)
        for role in layout.ROLES:
            restart_one(role)
        verified(config, before, others)
    except BaseException as failure:
        returned = False
        rollback_error = None
        try:
            layout.restore(layout.SYSTEM, background.UNIT_ROOT, original)
            base.run(['systemctl', 'daemon-reload'], timeout=15)
            return_workers()
            verified(config, before, others)
            returned = True
        except BaseException as error:
            rollback_error = type(error).__name__
        record(marker, {'status': 'failed', 'commit': config['commit'], 'rollback_verified': returned,
                        'failure_type': type(failure).__name__, 'rollback_error_type': rollback_error})
        raise RuntimeError('Worker-boot update failed; rollback verified.' if returned else
                           'Worker-boot update failed; inspect private evidence before retrying.') from None
    result = {'status': 'configured', 'commit': config['commit'], 'unit_sha256': config['worker_boot']['unit_sha256'],
              'root_definitions_verified': True, 'sequential_worker_restarts_verified': True,
              'preservation_checks_passed': True, 'shared_services_restarted': False}
    record(marker, result)
    return result


def review_layout(config):
    # Unit byte/path verification after exchange must not require already-reloaded manager state.
    return background.verify_current(config)


def published(config, work):
    validate(config)
    marker = work / 'result.json'
    if work.is_symlink() or marker.is_symlink() or not marker.is_file() or marker.stat().st_size > 65536:
        raise RuntimeError('Code must be published before changing worker definitions.')
    state = json.loads(marker.read_text())
    if state.get('status') != 'published' or state.get('commit') != config['commit']:
        raise RuntimeError('Worker boot requires the exact published commit.')
    if any(not (base.DATA / 'release' / name).is_file() or base.digest(base.DATA / 'release' / name) != checksum for name, checksum in config['files'].items()):
        raise RuntimeError('Active release differs from worker-boot review.')
    parent = base.DATA / '.local'
    if parent.is_symlink():
        raise RuntimeError('Worker-boot private evidence parent differs.')
    parent.mkdir(mode=0o700, exist_ok=True)
    return change(config, parent / ('worker-boot-' + config['commit']))
