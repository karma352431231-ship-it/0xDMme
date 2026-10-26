"""Exclude temporary metric identifiers while preserving aggregate backup history."""

import json
import os
from pathlib import Path
import re

TABLES = ('engagement_visitors', 'engagement_observations', 'engagement_contributors')
MANIFEST = 'engagement-backup.json'
DETECTION = "SELECT to_regclass('hash_talk.engagement_state') IS NOT NULL"
MEASURE = """SELECT coalesce((SELECT sum(charge) FROM hash_talk.engagement_visitors),0)
 +coalesce((SELECT sum(charge) FROM hash_talk.engagement_observations),0)
 +coalesce((SELECT sum(charge) FROM hash_talk.engagement_contributors),0)"""


def scalar(execute, sql):
    return execute(['psql', '--no-psqlrc', '--set=ON_ERROR_STOP=1', '--tuples-only',
                    '--no-align', '--quiet', '-c', sql]).decode().strip()


def temporary_bytes(execute):
    detected = scalar(execute, DETECTION)
    if detected == 'f':
        return None
    if detected != 't':
        raise RuntimeError('Metric backup schema detection is unavailable.')
    value = scalar(execute, MEASURE)
    if not re.fullmatch(r'0|[1-9][0-9]{0,15}', value) or int(value) > 9007199254740991:
        raise RuntimeError('Metric backup accounting is malformed.')
    return int(value)


def dump_options(excluded_bytes):
    return [] if excluded_bytes is None else [
        '--exclude-table-data=hash_talk.' + name for name in TABLES]


def record(work, excluded_bytes, checksum):
    if excluded_bytes is None:
        return
    path = Path(work) / MANIFEST
    payload = json.dumps({'version': 1, 'dump_sha256': checksum,
                          'excluded_charge_bytes': excluded_bytes}, sort_keys=True).encode() + b'\n'
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'wb') as output:
        output.write(payload)
        output.flush()
        os.fsync(output.fileno())


def restore_sql(work, checksum, *, listing):
    path = Path(work) / MANIFEST
    metrics = b'TABLE hash_talk engagement_state ' in listing
    if not path.exists() and not path.is_symlink():
        if metrics:
            raise RuntimeError('Filtered metric backup manifest is missing.')
        return b''
    if not metrics or any(('TABLE DATA hash_talk ' + name + ' ').encode() in listing for name in TABLES):
        raise RuntimeError('Metric backup contains an unexpected data section.')
    if path.is_symlink() or not path.is_file() or path.stat().st_size > 1024:
        raise RuntimeError('Metric backup manifest is irregular.')
    value = json.loads(path.read_text())
    if (not isinstance(value, dict) or set(value) != {'version', 'dump_sha256', 'excluded_charge_bytes'} or value['version'] != 1
            or value['dump_sha256'] != checksum or type(value['excluded_charge_bytes']) is not int
            or not 0 <= value['excluded_charge_bytes'] <= 9007199254740991):
        raise RuntimeError('Metric backup manifest differs from its dump.')
    amount = value['excluded_charge_bytes']
    # pg_restore restores source data before statement triggers. Their omitted
    # charges must be subtracted exactly once inside the same restore transaction.
    return ("""
DO $$
BEGIN
  IF EXISTS(SELECT 1 FROM hash_talk.engagement_visitors)
    OR EXISTS(SELECT 1 FROM hash_talk.engagement_observations)
    OR EXISTS(SELECT 1 FROM hash_talk.engagement_contributors) THEN
    RAISE EXCEPTION 'Temporary metric identifiers unexpectedly present in backup';
  END IF;
  IF NOT hash_talk.guard_content_usage() THEN RAISE EXCEPTION 'Global ledger unavailable'; END IF;
  UPDATE hash_talk.content_usage SET used_bytes=used_bytes-""" + str(amount) + """ WHERE singleton;
  IF NOT FOUND OR (SELECT used_bytes<0 FROM hash_talk.content_usage WHERE singleton) THEN
    RAISE EXCEPTION 'Filtered backup accounting is inconsistent';
  END IF;
  UPDATE hash_talk.engagement_state SET contributors_reset_at=clock_timestamp(),
    author_erased_at=clock_timestamp(),heartbeat_at=NULL WHERE singleton;
  INSERT INTO hash_talk.engagement_coverage(day,reason,started_at,ended_at,occurrences)
    SELECT (clock_timestamp() AT TIME ZONE 'UTC')::date,'collection_failure',
      greatest(started_at,clock_timestamp()-hash_talk.engagement_technical_retention()),clock_timestamp(),1
    FROM hash_talk.engagement_state WHERE singleton
    ON CONFLICT(day,reason) DO UPDATE SET
      started_at=least(hash_talk.engagement_coverage.started_at,excluded.started_at),
      ended_at=greatest(hash_talk.engagement_coverage.ended_at,excluded.ended_at),
      occurrences=hash_talk.engagement_coverage.occurrences+1;
END;
$$;
""").encode()
