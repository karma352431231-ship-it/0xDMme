"""Bounded own-worker process state and exact per-role PostgreSQL leases."""
import json
from pathlib import Path
import subprocess
import urllib.parse

import deploy_remote as base
from deploy_worker_layout import ROLES

LEASE_SQL = """WITH required(role,key) AS (VALUES
 ('ranking',hashtext('hash-talk:background:ranking')::bigint),
 ('content',hashtext('hash-talk:background:content')::bigint),
 ('public',hashtext('hash-talk:background:public')::bigint))
SELECT json_object_agg(role,(SELECT count(*) FROM pg_locks l
 WHERE l.locktype='advisory' AND l.granted AND l.mode='ExclusiveLock'
 AND l.database=(SELECT oid FROM pg_database WHERE datname=current_database())
 AND l.classid::bigint=((r.key >> 32) & 4294967295)
 AND l.objid::bigint=(r.key & 4294967295) AND l.objsubid=1)) FROM required r"""


def status(role):
    if role not in ROLES:
        raise RuntimeError('Unknown own worker role.')
    raw = base.run(['systemctl', 'show', '0xdmme-' + role + '-worker.service',
                    '--property=LoadState,ActiveState,SubState,MainPID,ExecMainStartTimestampMonotonic'], timeout=2)
    return dict(line.split('=', 1) for line in raw.decode().splitlines() if '=' in line)


def active(value):
    return (value.get('LoadState') == 'loaded' and value.get('ActiveState') == 'active'
            and value.get('SubState') == 'running' and value.get('MainPID', '').isdigit()
            and int(value['MainPID']) > 1)


def lease_environment(pid):
    entries = (Path('/proc') / str(pid) / 'environ').read_bytes().split(b'\0')
    matching = [entry for entry in entries if entry.startswith(b'HASH_TALK_DATABASE_URL=')]
    if len(matching) != 1:
        raise RuntimeError('Own readiness database environment missing or ambiguous.')
    url = urllib.parse.urlparse(matching[0].split(b'=', 1)[1].decode())
    if (url.scheme != 'postgresql' or url.query or url.fragment
            or url.hostname != '127.0.0.1' or url.port != 45433 or url.path != '/hash_talk_stage'
            or urllib.parse.unquote(url.username or '') != 'hash_talk_stage' or not url.password):
        raise RuntimeError('Own readiness database boundary differs.')
    # Only the owned process environment supplies secrets; they never enter argv/logs.
    return dict(PATH='/usr/bin:/bin', PGHOST=url.hostname, PGPORT=str(url.port),
                PGDATABASE=url.path[1:], PGUSER=urllib.parse.unquote(url.username),
                PGPASSWORD=urllib.parse.unquote(url.password), PGCONNECT_TIMEOUT='2',
                PGAPPNAME='0xdmme-worker-readiness',
                PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=1500 -c lock_timeout=500')


def lease_counts():
    raw = base.run(['systemctl', 'show', '0xdmme-test.service', '-p', 'MainPID', '--value'], timeout=2).strip()
    if not raw.isdigit() or int(raw) <= 1:
        return None
    pid = int(raw)
    try:
        environment = lease_environment(pid)
        result = subprocess.run(['nsenter', '--target', str(pid), '--net', '--', '/usr/bin/psql',
                                 '-X', '-q', '-A', '-t', '--set=ON_ERROR_STOP=on', '-c', LEASE_SQL],
                                env=environment, capture_output=True, timeout=3, check=True)
    except (subprocess.TimeoutExpired, FileNotFoundError, ProcessLookupError):
        return None
    except subprocess.CalledProcessError as error:
        if error.returncode == 2:
            return None
        raise RuntimeError('Own worker SQL readiness failed.') from None
    value = json.loads(result.stdout)
    if (not isinstance(value, dict) or set(value) != set(ROLES)
            or any(type(count) is not int or count < 0 for count in value.values())):
        raise RuntimeError('Own worker lease result differs.')
    return value


def ready(roles=ROLES):
    if not roles or len(set(roles)) != len(roles) or any(role not in ROLES for role in roles):
        raise RuntimeError('Unknown or duplicate own worker roles.')
    if not all(active(status(role)) for role in roles):
        return False
    leases = lease_counts()
    return leases is not None and all(leases[role] == 1 for role in roles)
