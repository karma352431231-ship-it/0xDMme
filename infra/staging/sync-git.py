#!/usr/bin/env python3
"""Copy an already-pushed commit into the dedicated VPS Git repository.

This synchronizes source history only. It never activates a release, runs npm,
applies migrations, changes infrastructure, or restarts a service.
"""

import json
import os
from pathlib import Path
import re
import shlex
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
OWNER = 'karma352431231-ship-it'
ORIGIN = f'https://github.com/{OWNER}/Hash-Talk.git'
REPOSITORY = '/var/lib/0xdmme/data/git/0xdmme.git'
SSH = ['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10',
       '-o', 'StrictHostKeyChecking=yes']
ENV = dict(os.environ, GIT_TERMINAL_PROMPT='0', GIT_ASKPASS='/usr/bin/false',
           GIT_SSH_COMMAND=shlex.join(SSH))


def run(args, timeout=30):
    result = subprocess.run(args, cwd=ROOT, env=ENV, capture_output=True,
                            text=True, timeout=timeout)
    if result.returncode:
        # Transport errors may contain private access details. Never print them.
        raise RuntimeError(f'Command failed: {args[0]}; exit {result.returncode}.')
    return result.stdout.strip()


def main():
    if len(sys.argv) != 1:
        raise RuntimeError('Run without arguments from the prepared repository.')
    if run(['git', 'remote', 'get-url', 'origin']) != ORIGIN:
        raise RuntimeError('Unexpected GitHub repository; synchronization refused.')
    if run(['git', 'status', '--porcelain']):
        raise RuntimeError('Commit the reviewed files before synchronizing.')
    branch = run(['git', 'symbolic-ref', '--short', 'HEAD'])
    if not re.fullmatch(r'codex/[A-Za-z0-9][A-Za-z0-9._/-]*', branch):
        raise RuntimeError('Only an explicit codex branch can be synchronized.')
    revision = run(['git', 'rev-parse', 'HEAD'])
    remote = run(['git', '-c', f'credential.username={OWNER}', 'ls-remote',
                  '--exit-code', 'origin', f'refs/heads/{branch}'])
    if remote.split()[0] != revision:
        raise RuntimeError('Push this exact commit to GitHub first.')
    target_file = ROOT / '.local/VPS_SSH_TARGET'
    run(['git', 'check-ignore', '--', '.local/VPS_SSH_TARGET'])
    if target_file.is_symlink():
        raise RuntimeError('Private SSH target must be a regular local file.')
    target = target_file.read_text().strip()
    if not re.fullmatch(r'[A-Za-z0-9_][A-Za-z0-9_.-]*@[A-Za-z0-9][A-Za-z0-9.-]*', target):
        raise RuntimeError('Invalid private SSH target; synchronization refused.')
    # The repository must have been prepared and reviewed separately. No bootstrap
    # or creation of arbitrary remote directories is performed by this tool.
    preflight = (
        f'test -d {REPOSITORY} && test ! -L {REPOSITORY} && '
        f'test "$(git --git-dir={REPOSITORY} config --get core.bare)" = true && '
        'test "$(findmnt -n -o TARGET --target /var/lib/0xdmme/data)" = '
        '/var/lib/0xdmme/data'
    )
    run([*SSH, target, preflight])
    # Receive Git objects inside our existing resource-limited slice. Hooks are
    # disabled; the VPS never receives GitHub credentials or runs repository code.
    receiver = shlex.join([
        'systemd-run', '--quiet', '--pipe', '--wait', '--collect',
        '--unit=0xdmme-git-receive', '--slice=xdmme-test.slice',
        '-p', 'CPUQuota=10%', '-p', 'MemoryMax=128M', '-p', 'TasksMax=24',
        '-p', 'NoNewPrivileges=yes', '/usr/bin/git',
        '-c', 'core.hooksPath=/dev/null', '-c', 'receive.fsckObjects=true',
        'receive-pack',
    ])
    run(['git', 'push', f'--receive-pack={receiver}',
         f'{target}:{REPOSITORY}', f'HEAD:refs/heads/{branch}'], timeout=120)
    deployed_source = run([
        *SSH, target, shlex.join(['git', f'--git-dir={REPOSITORY}',
                                 'rev-parse', f'refs/heads/{branch}']),
    ])
    if deployed_source != revision:
        raise RuntimeError('VPS revision verification failed.')
    print(json.dumps({'source_synchronized': True, 'commit': revision,
                      'running_release_changed': False}))


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, OSError, subprocess.SubprocessError) as error:
        # OSError can contain private paths; disclose only the safe error type.
        message = str(error) if isinstance(error, RuntimeError) else type(error).__name__
        print(message, file=sys.stderr)
        sys.exit(1)
