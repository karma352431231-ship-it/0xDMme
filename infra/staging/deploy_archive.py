"""Bounded manifest and archive verification; no activation or filesystem policy."""
import hashlib
import json
from pathlib import PurePosixPath
import re
import tarfile
import deploy_sources as public_sources

def digest(path):
    checksum = hashlib.sha256()
    with path.open('rb') as content:
        for chunk in iter(lambda: content.read(1024 * 1024), b''):
            checksum.update(chunk)
    return checksum.hexdigest()

def valid_release_branch(value):
    return isinstance(value, str) and re.fullmatch(r'(?:main|codex/[A-Za-z0-9][A-Za-z0-9._/-]*)', value) is not None

class ReleaseArchive:
    """The same budgets govern validation and extraction, supplied by the executor."""
    def __init__(self, manifest_bytes, archive_bytes, release_bytes):
        self.manifest_bytes = manifest_bytes
        self.archive_bytes = archive_bytes
        self.release_bytes = release_bytes

    def validate_manifest_budget(self, config):
        # These operational fields are not part of the persisted release manifest.
        # The complete transport, including these fields, retains its 24 MiB bound.
        manifest = {name: value for name, value in config.items()
                    if name not in ('baseline', 'archive', 'request_limit', 'media_worker', 'capacity', 'worker_boot')}
        if len((json.dumps(manifest, indent=2) + '\n').encode()) > self.manifest_bytes:
            raise RuntimeError('Release manifest byte budget exceeded.')


    def validate(self, config):
        if not re.fullmatch(r'[a-f0-9]{40}', config['commit']):
            raise RuntimeError('Invalid commit.')
        if not valid_release_branch(config['branch']):
            raise RuntimeError('Invalid branch.')
        files = config['files']
        if not isinstance(files, dict) or not files:
            raise RuntimeError('Invalid release manifest files.')
        self.validate_manifest_budget(config)
        for name, value in files.items():
            parts = PurePosixPath(name).parts
            if (not parts or name.startswith('/') or '..' in parts or
                    str(PurePosixPath(name)) != name or
                    parts[0] not in ['src', 'infra', 'dist', 'package.json', 'package-lock.json', '.nvmrc'] or
                    not re.fullmatch(r'[a-f0-9]{64}', value)):
                raise RuntimeError('Invalid release manifest path/digest.')
        if not 0 < config['archive_bytes'] <= self.archive_bytes:
            raise RuntimeError('Archive budget exceeded.')
        if not re.fullmatch(r'[a-f0-9]{64}', config['archive_sha256']):
            raise RuntimeError('Invalid archive digest.')
        if not re.fullmatch(r'/app-[a-f0-9]{16}\.js', config['script']):
            raise RuntimeError('Invalid public script.')
        if 'dist/web' + config['script'] not in files:
            raise RuntimeError('Public script absent from manifest.')
        public_sources.validate(config)


    def extract(self, archive, destination, allowed):
        names = set()
        for member in archive:
            # Include headers, extended headers and payload padding, so many empty
            # files cannot bypass the expanded-byte budget. Validate before writing.
            padded = ((member.size + tarfile.BLOCKSIZE - 1) // tarfile.BLOCKSIZE) * tarfile.BLOCKSIZE
            if member.offset_data + padded > self.release_bytes:
                raise RuntimeError('Extraction budget exceeded.')
            parts = PurePosixPath(member.name).parts
            if (not parts or member.name.startswith('/') or '..' in parts or
                    parts[0] not in allowed or member.name in names or
                    not (member.isfile() or member.isdir())):
                raise RuntimeError('Unsafe archive member.')
            names.add(member.name)
        archive.extractall(destination, filter='data')
