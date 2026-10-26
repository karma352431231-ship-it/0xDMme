"""Read-only first-install guard, separate from predecessor-based code upgrades."""

import json
import os
from pathlib import Path
import subprocess

DATA = Path('/var/lib/0xdmme/data')


def verify_empty(data):
    for name in ['release', 'postgres', 'objects', 'git']:
        path = data / name
        if path.exists() or path.is_symlink():
            raise RuntimeError('First-install target is not empty; upgrades require normal deployment.')


def inspect_target():
    if os.geteuid() != 0:
        raise RuntimeError('First-install inspection requires the approved administrator.')
    if DATA.is_symlink() or not DATA.is_dir():
        raise RuntimeError('Dedicated application volume missing.')
    mounted = subprocess.check_output(['findmnt', '--json', '--target', str(DATA)], timeout=10)
    filesystems = json.loads(mounted)['filesystems']
    if (len(filesystems) != 1 or filesystems[0]['target'] != str(DATA)
            or not {'noexec', 'nodev', 'nosuid'}.issubset(filesystems[0]['options'].split(','))
            or DATA.stat().st_dev == DATA.parent.stat().st_dev):
        raise RuntimeError('Dedicated application volume isolation differs.')
    verify_empty(DATA)
    if subprocess.check_output(['swapon', '--noheadings', '--show'], timeout=10).strip():
        raise RuntimeError('Swap must remain disabled.')
    return {'first_install_target_ready': True, 'existing_release_changed': False}


def remote_source():
    # Send this small, reviewed read-only module; no secret configuration needed.
    source = Path(__file__).read_text()
    return source + '\nprint(json.dumps(inspect_target()))\n'
