"""Pinned artifact and authored-pipeline identity; never download a model."""
import hashlib
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
PROJECT = HERE.parents[1]


def configuration():
    return json.loads((HERE / 'pose_models.json').read_text())


def model_identity():
    digest = hashlib.sha256()
    for name in configuration()['identityFiles']:
        path = PROJECT / name
        if path.resolve().is_relative_to(PROJECT) is False or path.is_symlink():
            raise ValueError('Invalid pipeline source.')
        payload = path.read_bytes()
        digest.update(len(payload).to_bytes(4, 'big'))
        digest.update(payload)
    return digest.hexdigest()


def verify_artifacts(root):
    root = Path(root)
    if not root.is_absolute() or not root.is_dir():
        raise ValueError('Absolute model directory required.')
    for name, expected in configuration()['artifacts'].items():
        path = root / name
        if path.is_symlink() or not path.is_file():
            raise ValueError('Regular model artifact required.')
        with path.open('rb') as source:
            if hashlib.file_digest(source, 'sha256').hexdigest() != expected:
                raise ValueError('Pinned model artifact differs.')
    return root
