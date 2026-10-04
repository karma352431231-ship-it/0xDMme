"""Exact block 10 runtime additions; original npm archives, no VPS install."""

import base64
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import shutil
import tarfile

BEFORE_LOCK = 'e569391aa19daf28a27c30a8567ce4d55324119d7d1bb2d6c3f36609640152d4'
REVIEWED_LOCK = 'a94082f173b3d553c15ea1c8b0db29452b7b79c41615c30478f0a924a12937db'
PACKAGES = ('agent-base', 'asn1.js', 'bn.js', 'buffer-equal-constant-time', 'debug',
            'ecdsa-sig-formatter', 'http_ece', 'https-proxy-agent', 'inherits',
            'jwa', 'jws', 'minimalistic-assert', 'minimist', 'ms', 'safe-buffer',
            'safer-buffer', 'web-push')
MAX_PACKAGE = 2 * 1024 * 1024
MAX_TOTAL = 4 * 1024 * 1024


def reviewed_entries(root):
    raw = (root / 'package-lock.json').read_bytes()
    if hashlib.sha256(raw).hexdigest() != REVIEWED_LOCK:
        raise RuntimeError('Push runtime lock differs from the exact review.')
    entries = json.loads(raw)['packages']
    return {name:entries['node_modules/' + name] for name in PACKAGES}


def review_contract(candidate, live):
    if hashlib.sha256((live / 'package-lock.json').read_bytes()).hexdigest() != BEFORE_LOCK:
        raise RuntimeError('Push runtime predecessor lock differs.')
    reviewed_entries(candidate)
    old = json.loads((live / 'package.json').read_bytes())
    new = json.loads((candidate / 'package.json').read_bytes())
    expected = dict(old)
    expected['dependencies'] = dict(old['dependencies'], **{'web-push':'3.6.7'})
    expected['devDependencies'] = dict(old['devDependencies'], **{'@types/web-push':'3.6.4'})
    if new != expected or (live / '.nvmrc').read_bytes() != (candidate / '.nvmrc').read_bytes():
        raise RuntimeError('Push review does not authorize another package/Node change.')


def verified_blob(path, entry):
    if path.is_symlink() or not path.is_file() or not 0 < path.stat().st_size <= MAX_PACKAGE:
        raise RuntimeError('Runtime archive path/size differs.')
    blob = path.read_bytes()
    integrity = 'sha512-' + base64.b64encode(hashlib.sha512(blob).digest()).decode()
    if entry['integrity'] != integrity:
        raise RuntimeError('Runtime archive npm integrity differs.')
    return blob


def package_members(archive):
    members = archive.getmembers()
    if not members or len(members) > 256 or sum(m.size for m in members) > MAX_PACKAGE:
        raise RuntimeError('Runtime package extraction budget exceeded.')
    names = {}
    unique = []
    for member in members:
        parts = PurePosixPath(member.name).parts
        if (not parts or parts[0] != 'package' or '..' in parts or member.name.startswith('/')
                or not (member.isfile() or member.isdir()) or member.name.endswith('.node')):
            raise RuntimeError('Unsafe/native runtime package member.')
        canonical = str(PurePosixPath(member.name))
        if canonical in names:
            # Original agent-base/https-proxy-agent archives contain this exact
            # ./ alias twice. Accept only byte-identical regular files here.
            previous = names[canonical]
            if (canonical != 'package/dist/index.js' or not previous.isfile() or not member.isfile()
                    or {previous.name, member.name} != {'package/./dist/index.js','package/dist/index.js'}
                    or archive.extractfile(previous).read() != archive.extractfile(member).read()):
                raise RuntimeError('Conflicting runtime package members.')
            continue
        names[canonical] = member
        unique.append(member)
    return unique


def inspect_package(blob, name, entry):
    with tarfile.open(fileobj=io.BytesIO(blob)) as archive:
        package_members(archive)
        package = json.loads(archive.extractfile('package/package.json').read())
    if (package['name'] != name or package['version'] != entry['version']
            or any(key in package.get('scripts', {}) for key in ['install','preinstall','postinstall'])
            or package.get('os') or package.get('cpu')):
        raise RuntimeError('Runtime package contract/native installation differs.')


def stage(source, cache):
    if hashlib.sha256((source / 'package-lock.json').read_bytes()).hexdigest() != REVIEWED_LOCK:
        return
    entries = reviewed_entries(source)
    destination = source / 'dist/runtime'
    destination.mkdir()
    total = 0
    for name, entry in entries.items():
        checksum = base64.b64decode(entry['integrity'].split('-', 1)[1], validate=True).hex()
        path = cache / 'content-v2/sha512' / checksum[:2] / checksum[2:4] / checksum[4:]
        blob = verified_blob(path, entry)
        inspect_package(blob, name, entry)
        total += len(blob)
        if total > MAX_TOTAL:
            raise RuntimeError('Runtime transport budget exceeded.')
        (destination / (name + '.tgz')).write_bytes(blob)


def install(candidate):
    directory = candidate / 'dist/runtime'
    if not directory.exists():
        if hashlib.sha256((candidate / 'package-lock.json').read_bytes()).hexdigest() == REVIEWED_LOCK:
            raise RuntimeError('Reviewed runtime archives absent.')
        return
    entries = reviewed_entries(candidate)
    if directory.is_symlink() or set(p.name for p in directory.iterdir()) != {n + '.tgz' for n in PACKAGES}:
        raise RuntimeError('Runtime transport contains unrelated packages.')
    total = sum(p.stat().st_size for p in directory.iterdir())
    if total > MAX_TOTAL:
        raise RuntimeError('Runtime transport budget exceeded.')
    # Verify every archive before replacing anything in the unpublished candidate.
    blobs = {name:verified_blob(directory / (name + '.tgz'), entry) for name, entry in entries.items()}
    for name, blob in blobs.items():
        inspect_package(blob, name, entries[name])
    for name, blob in blobs.items():
        temporary = candidate / 'node_modules/.0xdmme-runtime'
        temporary.mkdir()
        try:
            with tarfile.open(fileobj=io.BytesIO(blob)) as archive:
                archive.extractall(temporary, members=package_members(archive), filter='data')
            target = candidate / 'node_modules' / name
            if target.is_symlink():
                raise RuntimeError('Runtime package target is a link.')
            if target.exists():
                shutil.rmtree(target)
            (temporary / 'package').rename(target)
        finally:
            shutil.rmtree(temporary)
