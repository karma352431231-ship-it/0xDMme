"""Own worker guards and migration preservation; no SSH/system services."""
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'infra/staging'))
import deploy_background as workers
import deploy_remote as base


class BackgroundTests(unittest.TestCase):
    def test_new_sources_are_exact_paths_and_keep_archive_budget(self):
        from deploy_pipeline_test import manifest
        value = manifest()
        value['files'].update({p: 'a' * 64 for p in base.BACKGROUND_SOURCE_FILES})
        missing = base.MAX_MANIFEST_FILES - len(value['files'])
        value['files'].update({'src/f' + str(i) + '.ts': 'a' * 64 for i in range(missing)})
        base.validate(value)
        value['files']['infra/unreviewed.service'] = 'a' * 64
        with self.assertRaisesRegex(RuntimeError, 'manifest size'):
            base.validate(value)

    def test_migration_preserves_old_records_and_only_admits_known_initial_state(self):
        before = {'tables': {'communities': {'count': 3, 'hash': 'before'}},
                  'versions': list(range(43)), 'used_bytes': 1000}
        after = dict(before, versions=list(range(49)), used_bytes=1768)
        with patch.object(workers, 'snapshot', return_value=after), \
             patch.object(base, 'attachment_versions', return_value=list(range(49))), \
             patch.object(base, 'verify_community_tables') as tables, \
             patch.object(workers.backups, 'pg', return_value=b't\n') as pg:
            workers.verify_migration(Path('/candidate'), before)
            tables.assert_called_once_with(workers.OLD_TABLES + workers.NEW_TABLES)
            sql = pg.call_args.args[0][-1]
            self.assertIn('views<>0', sql)
            self.assertIn('created_at IS NOT NULL', sql)
            self.assertIn('used_bytes=1000+', sql)
            after['tables'] = {'communities': {'count': 3, 'hash': 'changed'}}
            with self.assertRaisesRegex(RuntimeError, 'existing records'):
                workers.verify_migration(Path('/candidate'), before)

    def test_worker_units_have_independent_restart_and_uncapped_parent_slice(self):
        root = Path(__file__).resolve().parents[1] / 'infra/staging'
        for role, unit in zip(workers.ROLES, workers.UNITS):
            content = (root / unit).read_text()
            self.assertIn('ExecStart=/usr/bin/node src/server/worker.ts ' + role, content)
            for line in ('Slice=xdmme-test.slice', 'MemorySwapMax=0',
                         'Restart=on-failure', 'PrivateNetwork=yes'):
                self.assertIn(line, content)
            for cap in ('CPUQuota=', 'MemoryMax=', 'TasksMax=', 'max-old-space-size'):
                self.assertNotIn(cap, content)
            self.assertNotIn('Requires=0xdmme-test.service', content)
            self.assertEqual('BindPaths=' in content, role != 'ranking')
        # Owner decision of 09/10/2026: the slice groups our services without caps;
        # swap stays off so decrypted content and keys never reach disk.
        parent = (root / 'xdmme-test.slice').read_text()
        self.assertIn('MemorySwapMax=0', parent)
        for cap in ('CPUQuota=', 'MemoryMax=', 'TasksMax=', 'BandwidthMax='):
            self.assertNotIn(cap, parent)

    def test_existing_unit_links_cannot_be_overwritten(self):
        with tempfile.TemporaryDirectory() as directory:
            dropin = Path(directory) / '40-background.conf'
            dropin.write_text('existing')
            with patch.object(workers, 'DROPIN', dropin), \
                 patch.object(base, 'reviewed_database'), \
                 patch.object(base, 'verify_community_tables'):
                with self.assertRaisesRegex(RuntimeError, 'already exists'):
                    workers.review(Path('/candidate'), Path('/live'))
            self.assertEqual(dropin.read_text(), 'existing')

    def test_activation_uses_existing_backup_and_rollback_executor(self):
        with patch.object(base, 'activate_database', return_value={'published': True}) as activate:
            result = workers.activate({}, Path('/work'), Path('/candidate'), {'files': {}})
            self.assertTrue(result['published'])
            transition = activate.call_args.args[3]
            self.assertEqual(transition['versions'], 43)
            self.assertIs(transition['stop'], workers.stop)
            self.assertIs(transition['start'], workers.start)
            self.assertIs(transition['uninstall'], workers.uninstall)

    def test_unit_validation_failure_prevents_installation_and_migration(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            dropin = root / '40-background.conf'
            unit_root = root / 'background-units'
            candidate = root / 'candidate'
            with patch.object(workers, 'DROPIN', dropin), \
                 patch.object(workers, 'UNIT_ROOT', unit_root), \
                 patch.object(base, 'reviewed_database'), \
                 patch.object(base, 'verify_community_tables'), \
                 patch.object(base, 'run', side_effect=RuntimeError('validator unavailable')) as command:
                with self.assertRaisesRegex(RuntimeError, 'validator unavailable'):
                    workers.review(candidate, root / 'live')
            command.assert_called_once_with(['systemd-analyze', 'verify',
                *(str(candidate / 'infra/staging' / unit) for unit in workers.UNITS)], timeout=30)
            self.assertFalse(dropin.exists())
            self.assertFalse(unit_root.exists())

    def test_worker_readiness_requires_three_exclusive_leases(self):
        with patch.object(base, 'run', return_value=b'active\n'), \
             patch.object(workers.backups, 'pg', return_value=b'2\n'):
            self.assertFalse(workers.ready())
        with patch.object(base, 'run', return_value=b'active\n'), \
             patch.object(workers.backups, 'pg', return_value=b'3\n'):
            self.assertTrue(workers.ready())
        with patch.object(base, 'run', return_value=b'failed\n'), \
             patch.object(workers.backups, 'pg', return_value=b'3\n'):
            self.assertFalse(workers.ready())

    def test_start_only_touches_our_worker_units_and_never_shared_services(self):
        with patch.object(base, 'run') as run, patch.object(workers, 'ready', return_value=True):
            workers.start()
        run.assert_called_once_with(['systemctl', 'start', *workers.UNITS])

    def test_start_waits_for_leases_after_transient_psql_connection_failure(self):
        failure = subprocess.CalledProcessError(2, ['/usr/lib/postgresql/16/bin/psql'])
        clock = {'seconds': 0}
        def sleep(seconds): clock['seconds'] += seconds
        with (patch.object(base, 'run') as command,
              patch.object(workers, 'ready', side_effect=[failure, True]),
              patch.object(workers.time, 'monotonic', side_effect=lambda: clock['seconds']),
              patch.object(workers.time, 'sleep', side_effect=sleep)):
            workers.start()
        command.assert_called_once_with(['systemctl', 'start', *workers.UNITS])
        self.assertEqual(clock['seconds'], 1)

    def test_persistent_connection_failure_does_not_publish_without_leases(self):
        failure = subprocess.CalledProcessError(2, ['/usr/lib/postgresql/16/bin/psql'])
        clock = {'seconds': 0}
        def sleep(seconds): clock['seconds'] += seconds
        with (patch.object(base, 'run'), patch.object(workers, 'ready', side_effect=failure),
              patch.object(workers.time, 'monotonic', side_effect=lambda: clock['seconds']),
              patch.object(workers.time, 'sleep', side_effect=sleep)):
            with self.assertRaisesRegex(RuntimeError, 'all three leases'):
                workers.start()
        self.assertEqual(clock['seconds'], 30)

    def test_start_does_not_retry_other_probe_failures(self):
        for code, command in [(1, ['/usr/lib/postgresql/16/bin/psql']),
                              (3, ['/usr/lib/postgresql/16/bin/psql']),
                              (2, ['/usr/bin/node'])]:
            with self.subTest(code=code, command=command):
                failure = subprocess.CalledProcessError(code, command)
                with (patch.object(base, 'run'),
                      patch.object(workers, 'ready', side_effect=failure),
                      patch.object(workers.time, 'sleep') as sleep):
                    with self.assertRaises(subprocess.CalledProcessError):
                        workers.start()
                sleep.assert_not_called()


class UncappedWorkerTransitionTests(unittest.TestCase):
    """Option A of 09/10/2026: only the pinned capped release may differ from installed units."""

    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        root = Path(temporary.name).resolve()
        self.data, self.system = root / 'data', root / 'system'
        self.units = self.data / 'background-units'
        self.release = self.data / 'release/infra/staging'
        for path in [self.units, self.release, self.system]:
            path.mkdir(parents=True)
        dropin = root / '40-background.conf'
        dropin.write_text('background mode')
        self.config = {'files': {'infra/staging/0xdmme-background.conf': base.digest(dropin)}}
        self.old = {unit: 'capped ' + unit for unit in workers.UNITS}
        pinned = {unit: base.hashlib.sha256(text.encode()).hexdigest() for unit, text in self.old.items()}
        for unit in workers.UNITS:
            (self.units / unit).write_text('uncapped ' + unit)
            (self.system / unit).symlink_to(self.units / unit)
            (self.release / unit).write_text(self.old[unit])
            self.config['files']['infra/staging/' + unit] = base.digest(self.units / unit)
        system = self.system
        self.patches = [
            patch.object(base, 'DATA', self.data),
            patch.object(workers, 'UNIT_ROOT', self.units),
            patch.object(workers, 'DROPIN', dropin),
            patch.object(workers, 'UNCAPPED_FROM', pinned),
            patch.object(workers, 'Path', lambda value: system if value == '/etc/systemd/system' else Path(value)),
        ]
        for item in self.patches:
            item.start()
            self.addCleanup(item.stop)

    def test_pinned_capped_release_with_installed_candidate_units_is_accepted(self):
        workers.verify_current(self.config)

    def test_release_units_already_equal_to_installed_are_accepted(self):
        for unit in workers.UNITS:
            (self.release / unit).write_text('uncapped ' + unit)
        workers.verify_current(self.config)

    def test_unpinned_release_content_is_refused(self):
        (self.release / workers.UNITS[0]).write_text('unreviewed release unit')
        with self.assertRaisesRegex(RuntimeError, 'without infrastructure review'):
            workers.verify_current(self.config)

    def test_installed_unit_must_match_the_candidate(self):
        (self.units / workers.UNITS[1]).write_text('edited on the server')
        with self.assertRaisesRegex(RuntimeError, 'without infrastructure review'):
            workers.verify_current(self.config)

    def test_regular_file_instead_of_link_is_refused(self):
        link = self.system / workers.UNITS[2]
        link.unlink()
        link.write_text('uncapped ' + workers.UNITS[2])
        with self.assertRaisesRegex(RuntimeError, 'link differs'):
            workers.verify_current(self.config)


if __name__ == '__main__':
    unittest.main()
