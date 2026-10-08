"""Exact 043→049 review and own worker lifecycle, invoked by deploy.py only."""

import os
from pathlib import Path
import time

import deploy_remote as base
import deploy_blocks45 as backups

BEFORE = '2921232287a929477e6d7cf18e7f82ff9d0fcddd'
REVIEWED = 'a2ed2c32cb63abd85311fc381b691fe1c6d6ce37'
ROLES = ('ranking', 'content', 'public')
UNITS = tuple('0xdmme-' + role + '-worker.service' for role in ROLES)
UNIT_ROOT = base.DATA / 'background-units'
DROPIN = Path('/etc/systemd/system/0xdmme-test.service.d/40-background.conf')
OLD_TABLES = base.COMMUNITIES_TABLES + base.COMMUNITIES_NEW_TABLES
NEW_TABLES = ('community_ranking_settings', 'community_ranking_state',
              'community_upvote_deltas', 'community_ranking_generations',
              'community_ranking_entries', 'community_ranking_cache_usage',
              'community_post_view_marks')


def snapshot():
    value = backups.database_snapshot(OLD_TABLES, omit_columns={
        'communities': ['created_at'], 'community_posts': ['views'],
        'content_usage': ['used_bytes'],
    })
    value['used_bytes'] = int(backups.pg(['psql', '--no-psqlrc', '--set=ON_ERROR_STOP=1',
        '--tuples-only', '--no-align', '-c',
        'SELECT used_bytes FROM hash_talk.content_usage WHERE singleton']).strip())
    return value


def review(candidate, live):
    base.reviewed_database(candidate, live, {'before': BEFORE, 'reviewed': REVIEWED,
        'versions': 49, 'previous_versions': 43})
    base.verify_community_tables(OLD_TABLES)
    if DROPIN.exists() or DROPIN.is_symlink() or UNIT_ROOT.exists():
        raise RuntimeError('Background configuration already exists; review interrupted transition.')
    for unit in UNITS:
        target = Path('/etc/systemd/system') / unit
        if target.exists() or target.is_symlink():
            raise RuntimeError('Worker unit already exists; review required.')
    if not DROPIN.parent.is_dir() or DROPIN.parent.is_symlink():
        raise RuntimeError('Own existing web drop-in directory required.')


def verify_migration(candidate, before):
    after, versions = snapshot(), base.attachment_versions(candidate)
    if (before['versions'] != versions[:43] or after['versions'] != versions
            or after['tables'] != before['tables']):
        raise RuntimeError('Ranking migration changed existing records.')
    base.verify_community_tables(OLD_TABLES + NEW_TABLES)
    empty = ' AND '.join('NOT EXISTS(SELECT 1 FROM hash_talk.' + table + ')'
        for table in NEW_TABLES if table not in ('community_ranking_settings',
                                               'community_ranking_state', 'community_ranking_cache_usage'))
    sql = ('SELECT ' + empty + ' AND '
        '(SELECT count(*) FROM hash_talk.community_ranking_settings)=1 AND '
        '(SELECT count(*) FROM hash_talk.community_ranking_cache_usage WHERE used_bytes=0)=1 AND '
        '(SELECT count(*) FROM hash_talk.community_ranking_state)=(SELECT count(*) FROM hash_talk.communities) AND '
        'NOT EXISTS(SELECT 1 FROM hash_talk.communities WHERE created_at IS NOT NULL) AND '
        'NOT EXISTS(SELECT 1 FROM hash_talk.community_posts WHERE views<>0) AND '
        'used_bytes=' + str(before['used_bytes']) +
        '+coalesce((SELECT sum(charge) FROM hash_talk.community_ranking_state),0) '
        'FROM hash_talk.content_usage WHERE singleton')
    if backups.pg(['psql', '--no-psqlrc', '--set=ON_ERROR_STOP=1',
                  '--tuples-only', '--no-align', '-c', sql]).strip() != b't':
        raise RuntimeError('Initial ranking/view ledger or historical defaults differ.')


def stop():
    present = tuple(unit for unit in UNITS if (Path('/etc/systemd/system') / unit).exists())
    if not present:
        return
    base.run(['systemctl', 'stop', *present])
    for unit in present:
        if base.run(['systemctl', 'show', unit, '--property=MainPID', '--value']).strip() != b'0':
            raise RuntimeError('Own worker did not stop.')


def ready():
    active = all(base.run(['systemctl', 'show', unit, '--property=ActiveState', '--value']).strip() == b'active' for unit in UNITS)
    sql = "SELECT count(*) FROM pg_locks WHERE locktype='advisory' AND granted AND objid IN (" + ','.join("(hashtext('hash-talk:background:" + role + "')::bigint & 4294967295)::oid" for role in ROLES) + ')'
    leases = backups.pg(['psql', '--no-psqlrc', '--tuples-only', '--no-align', '-c', sql]).strip()
    return active and leases == b'3'


def start():
    base.run(['systemctl', 'start', *UNITS])
    # Readiness includes each exclusive PostgreSQL lease, not merely a live PID.
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        if ready():
            return
        time.sleep(1)
    raise RuntimeError('Background workers did not acquire all three leases.')


def write_file(path, content):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o644)
    with os.fdopen(fd, 'wb') as handle:
        handle.write(content)
        handle.flush()
        os.fsync(handle.fileno())


def expected_state(before, source):
    files = dict(before['files'])
    files[str(DROPIN)] = base.digest(source / 'infra/staging/0xdmme-background.conf')
    for unit in UNITS:
        files[str(Path('/etc/systemd/system') / unit)] = base.digest(source / 'infra/staging' / unit)
    return dict(before, files=files)


def install(before, source):
    # Unit links belong to systemd; durable reviewed unit bytes stay on our volume.
    UNIT_ROOT.mkdir(mode=0o755)
    for unit in UNITS:
        write_file(UNIT_ROOT / unit, (source / 'infra/staging' / unit).read_bytes())
    write_file(DROPIN, (source / 'infra/staging/0xdmme-background.conf').read_bytes())
    base.run(['systemd-analyze', 'verify', *(str(UNIT_ROOT / unit) for unit in UNITS)], timeout=30)
    base.run(['systemctl', 'link', *(str(UNIT_ROOT / unit) for unit in UNITS)])
    base.run(['systemctl', 'daemon-reload'])
    base.run(['systemctl', 'enable', *UNITS])
    expected = expected_state(before, source)
    if base.own_state() != expected:
        raise RuntimeError('Worker installation changed unrelated own configuration.')
    return expected


def uninstall():
    # Only paths introduced by this transition may be removed.
    for unit in UNITS:
        link = Path('/etc/systemd/system') / unit
        if link.is_symlink() and link.resolve() == (UNIT_ROOT / unit).resolve():
            base.run(['systemctl', 'disable', unit])
            # systemctl disable also removes the unit's linked file.
        elif link.exists() or link.is_symlink():
            raise RuntimeError('Worker rollback path changed; review required.')
    if DROPIN.exists():
        DROPIN.unlink()
    if UNIT_ROOT.exists():
        for unit in UNITS:
            (UNIT_ROOT / unit).unlink(missing_ok=True)
        UNIT_ROOT.rmdir()
    base.run(['systemctl', 'daemon-reload'])


def activate(config, work, candidate, before_state):
    return base.activate_database(config, work, candidate, {
        'before_state': before_state, 'review': review, 'snapshot': snapshot,
        'versions': 43, 'verify': verify_migration, 'start': start,
        'install': lambda: install(before_state, base.DATA / 'release'),
        'uninstall': uninstall, 'stop': stop,
    })


def verify_current(config):
    source = base.DATA / 'release'
    if base.digest(DROPIN) != config['files']['infra/staging/0xdmme-background.conf']:
        raise RuntimeError('Own background mode differs from the release.')
    for unit in UNITS:
        path = Path('/etc/systemd/system') / unit
        if not path.is_symlink() or path.resolve() != UNIT_ROOT / unit:
            raise RuntimeError('Own worker unit link differs.')
        if (base.digest(path) != base.digest(source / 'infra/staging' / unit)
                or base.digest(path) != config['files']['infra/staging/' + unit]):
            raise RuntimeError('Own worker unit changed without infrastructure review.')
