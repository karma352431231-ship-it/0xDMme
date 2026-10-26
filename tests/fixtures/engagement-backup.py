"""Real local dump/restore exercise; every database and value is synthetic."""

import hashlib
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
from urllib.parse import unquote, urlparse
import uuid

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'infra/staging'))
import deploy_engagement_backup as policy
from deploy_backup_io import restore_transaction

source = urlparse(os.environ['HASH_TALK_DATABASE_URL'])
if not source.path.startswith('/hash_talk_test') or source.hostname != '127.0.0.1':
    raise RuntimeError('Only a local synthetic database is permitted.')
environment = dict(os.environ, PGHOST=source.hostname, PGPORT=str(source.port or 5432),
                   PGUSER=unquote(source.username or ''), PGPASSWORD=unquote(source.password or ''),
                   PGDATABASE=source.path[1:])
target = 'hash_talk_test_engagement_backup_' + uuid.uuid4().hex
binary = Path(os.environ.get('HASH_TALK_TEST_POSTGRES_BIN', '/usr/bin'))


def execute(args, *, output=None, input_file=None):
    executable = binary / args[0]
    if not executable.is_file():
        executable = shutil.which(args[0])
    if not executable:
        raise RuntimeError('The PostgreSQL test client is unavailable.')
    result = subprocess.run([str(executable), *args[1:]], env=environment, stdin=input_file,
                            stdout=output or subprocess.PIPE, stderr=subprocess.PIPE,
                            check=True, timeout=45)
    return result.stdout


def scalar(sql):
    return policy.scalar(execute, sql)


def digest_table(name):
    # Only a digest is retained, never a public identifier or source payload.
    return scalar("SELECT md5(coalesce(string_agg(row::text,'' ORDER BY row::text),'')) "
                  "FROM (SELECT to_jsonb(t) AS row FROM hash_talk." + name + " t) values")


created = False
try:
    with tempfile.TemporaryDirectory(prefix='0xdmme-metric-backup-') as directory:
        work = Path(directory)
        excluded = policy.temporary_bytes(execute)
        if not excluded:
            raise RuntimeError('The fixture must contain temporary metric records.')
        original_bytes = int(scalar('SELECT used_bytes FROM hash_talk.content_usage WHERE singleton'))
        had_coverage = scalar("SELECT EXISTS(SELECT 1 FROM hash_talk.engagement_coverage "
                              "WHERE day=(clock_timestamp() AT TIME ZONE 'UTC')::date AND reason='collection_failure')") == 't'
        permanent = {name: digest_table(name) for name in ('engagement_counts', 'engagement_snapshots')}
        dump = work / 'database.dump'
        execute(['pg_dump', '--format=custom', '--no-owner', '--no-acl', '--schema=hash_talk',
                 *policy.dump_options(excluded), '--file=' + str(dump)])
        if policy.temporary_bytes(execute) != excluded:
            raise RuntimeError('Synthetic writers changed during backup.')
        checksum = hashlib.sha256(dump.read_bytes()).hexdigest()
        policy.record(work, excluded, checksum)
        listing = execute(['pg_restore', '--list', str(dump)])
        sql = policy.restore_sql(work, checksum, listing=listing)
        scalar('CREATE DATABASE ' + target + ' TEMPLATE template0')
        created = True
        environment['PGDATABASE'] = target
        scalar('CREATE SCHEMA hash_talk')
        restore_transaction(work, dump, execute, rollback=True, after_restore=sql)
        if scalar("SELECT to_regclass('hash_talk.engagement_state') IS NULL") != 't':
            raise RuntimeError('Restore rehearsal did not roll back.')
        restore_transaction(work, dump, execute, rollback=False, after_restore=sql)
        for name in policy.TABLES:
            if scalar('SELECT count(*) FROM hash_talk.' + name) != '0':
                raise RuntimeError('A temporary identifier survived restoration.')
        for name, expected in permanent.items():
            if digest_table(name) != expected:
                raise RuntimeError('Permanent aggregate backup history changed.')
        restored_bytes = int(scalar('SELECT used_bytes FROM hash_talk.content_usage WHERE singleton'))
        if restored_bytes != original_bytes - excluded + (0 if had_coverage else 256):
            raise RuntimeError('Filtered restoration miscounted logical storage.')
        if scalar('SELECT contributors_reset_at IS NOT NULL FROM hash_talk.engagement_state WHERE singleton') != 't':
            raise RuntimeError('Restored distinct coverage was not qualified.')
        print('Filtered backup/restore preserved aggregates and exact quota accounting; temporary records were absent.')
finally:
    if created:
        environment['PGDATABASE'] = source.path[1:]
        scalar('DROP DATABASE ' + target + ' WITH (FORCE)')
