"""Private, explicitly selected deployment targets; never mutate the default target."""

import json
import re


def profile_directory(private_root, name=None):
    local = private_root / '.local'
    if name is None:
        return local
    if not re.fullmatch(r'[a-z][a-z0-9-]{0,47}', name):
        raise RuntimeError('Invalid deployment target profile.')
    directory = local / 'deployment-profiles' / name
    for path in [local, directory.parent, directory]:
        if path.is_symlink() or not path.is_dir() or path.stat().st_mode & 0o077:
            raise RuntimeError('Private target profile missing or unsafe.')
    return directory


def private_text(directory, name, limit):
    path = directory / name
    if (path.is_symlink() or not path.is_file() or path.stat().st_mode & 0o077
            or path.stat().st_size > limit):
        raise RuntimeError('Private target input missing or unsafe.')
    return path.read_text()


def target(directory):
    value = private_text(directory, 'VPS_SSH_TARGET', 256).strip()
    if not re.fullmatch(r'[A-Za-z0-9_][A-Za-z0-9_.-]*@[A-Za-z0-9][A-Za-z0-9.-]*', value):
        raise RuntimeError('Invalid private SSH target.')
    return value


def preservation_baseline(directory, explicit=False):
    value = json.loads(private_text(directory, 'VPS_DEPLOY_BASELINE.json', 256 * 1024))
    if not isinstance(value, dict):
        raise RuntimeError('Private preservation baseline incomplete.')
    empty = value.get('empty_categories', [])
    if (not isinstance(empty, list)
            or any(not isinstance(name, str) or name not in ['files', 'services', 'sites'] for name in empty)
            or len(set(empty)) != len(empty)
            or (empty and not explicit)):
        raise RuntimeError('Unreviewed empty preservation categories.')
    for name, kind in [('files', dict), ('services', dict), ('sites', list)]:
        category = value.get(name)
        if not isinstance(category, kind) or (not category) != (name in empty):
            raise RuntimeError('Private preservation baseline incomplete.')
    return value
