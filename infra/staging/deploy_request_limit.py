"""The owner-approved 5→30 r/s site change, called only by deploy.py."""

import hashlib
import json
import os
from pathlib import Path

import deploy_remote as base

PROXY = Path('/etc/nginx/sites-available/0xdmme-test.conf')
RATE = 'limit_req_zone $binary_remote_addr zone=xdmme_requests:1m rate=5r/s;'
BURST = 'limit_req zone=xdmme_requests burst=20 nodelay;'
REPLACEMENTS = ((RATE, RATE.replace('5r/s', '30r/s')),
                (BURST, BURST.replace('burst=20', 'burst=120')))
MAX_CONFIG = 16384


def validate(proposal):
    if not isinstance(proposal, dict) or set(proposal) != {
            'path', 'old_content', 'new_content', 'old_sha256', 'new_sha256'}:
        raise RuntimeError('Invalid request-limit review.')
    if proposal['path'] != str(PROXY):
        raise RuntimeError('Request-limit review targets another site.')
    old, new = proposal['old_content'], proposal['new_content']
    if not isinstance(old, str) or not isinstance(new, str):
        raise RuntimeError('Invalid request-limit configuration.')
    expected = old
    for before, after in REPLACEMENTS:
        if expected.count(before) != 1:
            raise RuntimeError('Request-limit predecessor differs from approval.')
        expected = expected.replace(before, after)
    if new != expected:
        raise RuntimeError('Request-limit change exceeds the approval.')
    for name, content in [('old', old), ('new', new)]:
        if len(content.encode()) > MAX_CONFIG or hashlib.sha256(content.encode()).hexdigest() != proposal[name + '_sha256']:
            raise RuntimeError('Request-limit review size/hash mismatch.')


def reviewed_path(proposal):
    validate(proposal)
    if PROXY.is_symlink() or not PROXY.is_file() or PROXY.stat().st_nlink != 1:
        raise RuntimeError('Unexpected own proxy configuration path.')
    if base.digest(PROXY) not in [proposal['old_sha256'], proposal['new_sha256']]:
        raise RuntimeError('Own proxy changed since request-limit review.')


def write_config(content):
    fd = os.open(PROXY, os.O_WRONLY | os.O_NOFOLLOW)
    with os.fdopen(fd, 'wb') as handle:
        handle.write(content)
        handle.truncate()
        handle.flush()
        os.fsync(handle.fileno())


def verified_state(config, expected):
    base.preservation(config['baseline'])
    if base.own_state() != expected:
        raise RuntimeError('Unapproved configuration/database change.')
    base.healthy()


def record(path, value):
    if path.is_symlink():
        raise RuntimeError('Unexpected proxy receipt path.')
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'w') as handle:
        json.dump(value, handle)
        handle.flush()
        os.fsync(handle.fileno())


def change(config, work):
    proposal = config['request_limit']
    reviewed_path(proposal)
    base.preservation(config['baseline'])
    before = base.own_state()
    if work.is_symlink():
        raise RuntimeError('Unexpected request-limit evidence path.')
    work.mkdir(mode=0o700, exist_ok=True)
    marker = work / 'request-limit-result.json'
    if base.digest(PROXY) == proposal['new_sha256']:
        if marker.is_symlink() or not marker.is_file():
            raise RuntimeError('Request-limit change has no verified receipt; review required.')
        result = json.loads(marker.read_text())
        if result.get('status') != 'configured' or result.get('sha256') != proposal['new_sha256']:
            raise RuntimeError('Request-limit receipt differs; review required.')
        base.run(['nginx', '-t'])
        verified_state(config, before)
        return dict(result, already_configured=True)
    previous = PROXY.read_bytes()
    backup = work / 'request-limit-before.conf'
    if backup.is_symlink() or backup.exists():
        raise RuntimeError('Previous request-limit attempt requires review.')
    fd = os.open(backup, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'wb') as handle:
        handle.write(previous)
        handle.flush()
        os.fsync(handle.fileno())
    expected = dict(before, files=dict(before['files'], **{str(PROXY): proposal['new_sha256']}))
    try:
        write_config(proposal['new_content'].encode())
        base.run(['nginx', '-t'])
        base.run(['systemctl', 'reload', 'nginx'])
        verified_state(config, expected)
    except BaseException:
        returned = False
        try:
            write_config(previous)
            base.run(['nginx', '-t'])
            base.run(['systemctl', 'reload', 'nginx'])
            verified_state(config, before)
            returned = True
        except BaseException:
            pass
        record(marker, {'status': 'failed', 'rollback_verified': returned})
        raise RuntimeError('Request-limit update failed; rollback verified.' if returned else
                           'Request-limit update failed; inspect private evidence before retrying.') from None
    result = {'status': 'configured', 'requests_per_second': 30, 'burst': 120,
              'sha256': proposal['new_sha256'], 'graceful_reload_verified': True,
              'preservation_checks_passed': True, 'shared_services_restarted': False}
    record(marker, result)
    return result
