"""Select the local deployment interpreter before any release operation."""

import os
from pathlib import Path
import shutil
import subprocess
import sys

REQUIRED_VERSION = (3, 14)
STANDARD_INTERPRETERS = (
    '/opt/homebrew/bin/python3.14',
    '/usr/local/bin/python3.14',
    '/Library/Frameworks/Python.framework/Versions/3.14/bin/python3.14',
)


def is_python314(executable):
    # Isolated startup ignores PYTHONPATH/user site; the probe has no output,
    # project imports or writes, and cannot hold deployment indefinitely.
    try:
        result = subprocess.run(
            [executable, '-I', '-S', '-c',
             'import sys; raise SystemExit(sys.version_info[:2] != (3, 14))'],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=3)
    except (OSError, subprocess.TimeoutExpired):
        return False
    return result.returncode == 0


def ensure_python314(script):
    if sys.version_info[:2] == REQUIRED_VERSION:
        return
    candidates = dict.fromkeys([shutil.which('python3.14'), *STANDARD_INTERPRETERS])
    for executable in candidates:
        if not executable or not is_python314(executable):
            continue
        try:
            # Keep cwd, environment and CLI options. The new interpreter returns
            # above immediately, so re-execution cannot loop on Python 3.14.
            os.execv(executable, [executable, str(Path(script).resolve()), *sys.argv[1:]])
        except OSError:
            continue
    raise RuntimeError(
        'Python 3.14 is required for local deployment and was not found or could not start. '
        'Make python3.14 available in PATH or a standard Homebrew/python.org location. '
        'No release operation was started.')
