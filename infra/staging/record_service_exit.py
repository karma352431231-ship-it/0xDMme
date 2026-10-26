"""Own service exit evidence only; no environment/exception/request logging."""
import datetime
import json
import os
from pathlib import Path

RESULTS = {'success', 'protocol', 'timeout', 'exit-code', 'signal', 'core-dump',
           'watchdog', 'exec-condition', 'oom-kill', 'start-limit-hit', 'resources'}
SIGNALS = {'HUP', 'INT', 'QUIT', 'ILL', 'ABRT', 'FPE', 'KILL', 'SEGV', 'PIPE',
           'ALRM', 'TERM', 'USR1', 'USR2', 'BUS', 'XCPU', 'XFSZ'}


def record(environment, directory):
    result = environment.get('SERVICE_RESULT', '')
    code = environment.get('EXIT_CODE', '')
    status = environment.get('EXIT_STATUS', '')
    numeric = status.isascii() and status.isdigit() and len(status) <= 3 and int(status) <= 255
    value = dict(version=1, recordedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),
                 result=result if result in RESULTS else 'unknown',
                 exitCode=code if code in {'exited', 'killed', 'dumped'} else 'unknown',
                 exitStatus=int(status) if numeric else status if status in SIGNALS else 'unknown')
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    if directory.resolve() != directory.absolute():
        raise RuntimeError('Diagnostic directory must not use symbolic links.')
    target = directory / 'service-exit.json'
    pending = directory / 'service-exit.json.pending'
    descriptor = os.open(pending, os.O_CREAT | os.O_WRONLY | os.O_TRUNC | os.O_NOFOLLOW, 0o600)
    try:
        os.fchmod(descriptor, 0o600)
        with os.fdopen(descriptor, 'w', closefd=False) as output:
            output.write(json.dumps(value))
            output.flush()
        os.fsync(descriptor)
    finally:
        os.close(descriptor)
    os.replace(pending, target)


def main():
    root = Path('/var/lib/0xdmme/data/objects')
    objects = Path(os.environ.get('HASH_TALK_OBJECT_DIRECTORY', str(root / 'content')))
    if not objects.is_absolute() or root not in objects.parents or objects.resolve() != objects:
        raise RuntimeError('Own object boundary differs.')
    record(os.environ, objects / '.diagnostics')


if __name__ == '__main__':
    try:
        main()
    except Exception:
        raise SystemExit('Service exit diagnostics unavailable.') from None
