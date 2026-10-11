"""Owner-approved media bundle update inside the existing release transaction."""
from contextlib import contextmanager
import hashlib
import json
import os
from pathlib import Path
import re
import socket
import sys
import tarfile

import deploy_remote as base
import deploy_blocks45 as backups

UNIT = '0xdmme-media.service'
UNIT_FILE = Path('/etc/systemd/system/' + UNIT)
DROPIN = Path('/etc/systemd/system/' + UNIT + '.d/60-code-release.conf')
ROOT = base.DATA / 'media-worker'
LEGACY = base.DATA / 'media-runtime/current/worker.mjs'
BUNDLE = 'dist/media-worker/worker.mjs'
MAX_BUNDLE = 256 * 1024
MAX_RETAINED = 8


def review(config):
    value = config.get('media_worker')
    names = {'before_unit', 'before_dropin', 'before_worker', 'candidate_worker'}
    if not isinstance(value, dict) or set(value) != names:
        raise RuntimeError('Exact private media worker review required.')
    for name, digest in value.items():
        if name == 'before_dropin' and digest is None:
            continue
        if not isinstance(digest, str) or not re.fullmatch(r'[a-f0-9]{64}', digest):
            raise RuntimeError('Invalid media worker fingerprint.')
    if value['candidate_worker'] != config['files'].get(BUNDLE):
        raise RuntimeError('Media worker differs from the exact release build.')
    return value


def contents(directory):
    return ('[Service]\nExecStart=\nExecStart=/usr/bin/node /opt/0xdmme-media-worker/worker.mjs\n'
            'BindReadOnlyPaths=' + str(directory) + ':/opt/0xdmme-media-worker\n').encode()


def previous_content():
    if DROPIN.is_symlink():
        raise RuntimeError('Unsafe media worker drop-in.')
    if not DROPIN.exists():
        return None
    if not DROPIN.is_file() or DROPIN.stat().st_size > 1024:
        raise RuntimeError('Media worker drop-in budget exceeded.')
    return DROPIN.read_bytes()


def previous_bundle(content):
    if content is None:
        return LEGACY
    pattern = re.escape(contents(ROOT / 'IDENTITY')).replace(b'IDENTITY', b'([a-f0-9]{64})')
    match = re.fullmatch(pattern, content)
    if not match:
        raise RuntimeError('Unreviewed previous media worker configuration.')
    return ROOT / match[1].decode() / 'worker.mjs'


def validate_current(config):
    value = review(config)
    if UNIT_FILE.is_symlink() or base.digest(UNIT_FILE) != value['before_unit']:
        raise RuntimeError('Installed media service differs from review.')
    previous = previous_content()
    expected = contents(ROOT / value['candidate_worker'])
    if previous == expected:
        if base.digest(previous_bundle(previous)) != value['candidate_worker']:
            raise RuntimeError('Active media worker changed.')
        return previous
    checksum = hashlib.sha256(previous).hexdigest() if previous is not None else None
    if checksum != value['before_dropin'] or base.digest(previous_bundle(previous)) != value['before_worker']:
        raise RuntimeError('Installed media worker differs from review.')
    return previous


def bundle(config, work):
    archive_path = work / 'build.tar.gz'
    if archive_path.is_symlink() or base.digest(archive_path) != config['archive_sha256']:
        raise RuntimeError('Media build archive differs.')
    with tarfile.open(archive_path) as archive:
        members = [member for member in archive.getmembers() if member.name == BUNDLE]
        if len(members) != 1 or not members[0].isfile() or not 0 < members[0].size <= MAX_BUNDLE:
            raise RuntimeError('Invalid media worker bundle.')
        data = archive.extractfile(members[0]).read(MAX_BUNDLE + 1)
    if hashlib.sha256(data).hexdigest() != review(config)['candidate_worker']:
        raise RuntimeError('Media worker build fingerprint differs.')
    return data


def install(directory, data):
    if ROOT.is_symlink() or directory.is_symlink():
        raise RuntimeError('Unsafe media worker store.')
    ROOT.mkdir(mode=0o755, exist_ok=True)
    entries = list(ROOT.iterdir())
    if len(entries) > MAX_RETAINED:
        raise RuntimeError('Media bundle retention budget exceeded.')
    for entry in entries:
        path = entry / 'worker.mjs'
        if (not re.fullmatch(r'[a-f0-9]{64}', entry.name) or entry.is_symlink() or not entry.is_dir()
                or list(entry.iterdir()) != [path] or path.is_symlink() or not path.is_file()
                or path.stat().st_size > MAX_BUNDLE or base.digest(path) != entry.name):
            raise RuntimeError('Immutable media bundle store differs.')
    if directory.exists():
        if (directory / 'worker.mjs').read_bytes() != data:
            raise RuntimeError('Existing immutable media bundle differs.')
        return
    if len(entries) >= MAX_RETAINED:
        raise RuntimeError('Review retained own media bundles before adding another.')
    directory.mkdir(mode=0o755)
    with (directory / 'worker.mjs').open('xb') as handle:
        handle.write(data)
        handle.flush()
        os.fsync(handle.fileno())
    (directory / 'worker.mjs').chmod(0o444)


def replace_dropin(content):
    if DROPIN.parent.is_symlink() or DROPIN.is_symlink():
        raise RuntimeError('Unsafe media worker configuration directory.')
    DROPIN.parent.mkdir(mode=0o755, exist_ok=True)
    if content is None:
        DROPIN.unlink(missing_ok=True)
        return
    temporary = DROPIN.with_suffix('.tmp')
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o644)
    try:
        with os.fdopen(descriptor, 'wb') as handle:
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        temporary.replace(DROPIN)
    finally:
        temporary.unlink(missing_ok=True)


def handshake():
    with socket.socket(socket.AF_UNIX) as client:
        client.settimeout(10)
        client.connect('/run/0xdmme-media.sock')
        client.sendall(b'{"operation":"health"}\n')
        client.shutdown(socket.SHUT_WR)
        response = bytearray()
        while len(response) <= 4096:
            chunk = client.recv(4097 - len(response))
            if not chunk:
                break
            response.extend(chunk)
    if len(response) > 4096 or json.loads(response) != {'ok':True, 'output':'0xdmme-media-worker-v1'}:
        raise RuntimeError('Media worker handshake failed.')


def restart():
    base.run(['systemctl', 'daemon-reload'])
    base.run(['systemctl', 'restart', UNIT])
    handshake()


def verify_preservation(config, before):
    after = base.own_state()
    old = {p:h for p,h in before['files'].items() if p != str(DROPIN)}
    new = {p:h for p,h in after['files'].items() if p != str(DROPIN)}
    if old != new or before['postgres'] != after['postgres']:
        raise RuntimeError('Unrelated own configuration/database changed during media activation.')
    base.preservation(config['baseline'])


@contextmanager
def activation(config, work):
    previous = validate_current(config)
    expected = contents(ROOT / review(config)['candidate_worker'])
    if previous == expected:
        handshake()
        yield {'updated':False, 'already_current':True}
        return
    active = backups.pg(['psql', '--no-psqlrc', '--tuples-only', '--no-align', '-c',
                         "SELECT count(*) FROM hash_talk.community_media WHERE status='processing' OR writer IS NOT NULL"]).strip()
    if active != b'0':
        raise RuntimeError('Wait for current media writers before updating their worker.')
    before = base.own_state()
    base.preservation(config['baseline'])
    install(ROOT / review(config)['candidate_worker'], bundle(config, work))
    try:
        replace_dropin(expected)
        restart()
        verify_preservation(config, before)
    except BaseException:
        restore(config, work, previous, before)
        raise
    try:
        yield {'updated':True, 'previous_bundle_retained':True}
    except BaseException:
        # The existing web executor first restores its own release/configuration.
        restore(config, work, previous, before)
        raise


def restore(config, work, previous, before):
    replace_dropin(previous)
    restart()
    verify_preservation(config, before)
    print(json.dumps({'media_worker':{'updated':False, 'rollback_verified':True}}),file=sys.stderr,flush=True)


def directory_setup():
    # The only host write before the restricted executor is this absent own
    # directory. No broad systemd directory is writable inside the executor.
    return ('from pathlib import Path\n'
            'p=Path(' + repr(str(DROPIN.parent)) + ')\n'
            'if p.is_symlink() or (p.exists() and not p.is_dir()): raise RuntimeError("Unsafe own media drop-in directory")\n'
            'p.mkdir(mode=0o755,exist_ok=True)\n')
