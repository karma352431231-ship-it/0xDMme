"""Hash-verified public Matrix source parts copied from the committed Git blob."""

import hashlib
import os
import select
import time
import subprocess

SOURCE_HASH = '1da81a1b9089e833800becb0fbd3ac46dd323d445cd8856c53695db13d4bfc60'
SOURCE_BYTES = 37444636
SOURCE_BLOB = 'vendor/matrix-crypto-18.9.0/preferred-source.tar.xz'
PART_BYTES = 2 * 1024 * 1024
PARTS = tuple('dist/web/matrix-crypto-18.9.0-source-1da81a1b9089e833-%02d.bin' % n for n in range(1, 19))


def metadata(files):
    present = [name for name in files if '/matrix-crypto-' in name and '-source-' in name and name.endswith('.bin')]
    if not present:
        if 'dist/web/matrix-crypto-18.9.0.wasm' in files:
            raise RuntimeError('Matrix WASM has no corresponding-source parts.')
        return {}
    if set(present) != set(PARTS):
        raise RuntimeError('Corresponding-source part set differs from the reviewed version.')
    return {'source_parts':list(PARTS), 'source_sha256':SOURCE_HASH,
            'source_blob':SOURCE_BLOB, 'source_bytes':SOURCE_BYTES}


def validate(config):
    expected = metadata(config['files'])
    for key in ['source_parts', 'source_sha256', 'source_blob', 'source_bytes']:
        if config.get(key) != expected.get(key):
            raise RuntimeError('Corresponding-source contract differs.')


def reconstruct(config, candidate, repository):
    validate(config)
    if not config.get('source_parts'):
        return
    args = ['git', '--git-dir=' + str(repository), 'show', config['commit'] + ':' + SOURCE_BLOB]
    combined = hashlib.sha256()
    process = subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    deadline = time.monotonic() + 60
    def read_chunk(size):
        timeout = max(0, deadline - time.monotonic())
        if not select.select([process.stdout], [], [], timeout)[0]:
            raise RuntimeError('Corresponding-source read timed out.')
        return os.read(process.stdout.fileno(), size)
    try:
        remaining = SOURCE_BYTES
        for name in PARTS:
            path = candidate / name
            if path.exists() or path.is_symlink():
                raise RuntimeError('Source part already present in transport archive.')
            chunk_hash = hashlib.sha256()
            size = min(PART_BYTES, remaining)
            with path.open('xb') as handle:
                while size:
                    chunk = read_chunk(min(size, 65536))
                    if not chunk:
                        raise RuntimeError('Corresponding-source blob truncated.')
                    handle.write(chunk)
                    chunk_hash.update(chunk)
                    combined.update(chunk)
                    size -= len(chunk)
                    remaining -= len(chunk)
            if chunk_hash.hexdigest() != config['files'][name]:
                raise RuntimeError('Corresponding-source part differs from Mac build.')
        if remaining or read_chunk(1) or process.wait(timeout=30) != 0 or combined.hexdigest() != SOURCE_HASH:
            raise RuntimeError('Corresponding-source size/hash differs.')
    finally:
        process.stdout.close()
        if process.poll() is None:
            process.kill()
        process.wait(timeout=5)


def verify_local(config, blob):
    validate(config)
    if not config.get('source_parts'):
        return
    if blob.is_symlink() or not blob.is_file() or blob.stat().st_size != SOURCE_BYTES:
        raise RuntimeError('Local corresponding-source blob size/path differs.')
    combined = hashlib.sha256()
    with blob.open('rb') as handle:
        for name in PARTS:
            chunk = handle.read(PART_BYTES)
            combined.update(chunk)
            if hashlib.sha256(chunk).hexdigest() != config['files'][name]:
                raise RuntimeError('Local corresponding-source part hash differs.')
    if combined.hexdigest() != SOURCE_HASH:
        raise RuntimeError('Local corresponding-source hash differs.')
