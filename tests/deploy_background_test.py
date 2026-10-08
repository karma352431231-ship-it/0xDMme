"""Own worker guards and migration preservation; no SSH/system services."""
import json
from pathlib import Path
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
        value['files'].update({'src/f' + str(i) + '.ts': 'a' * 64 for i in range(511)})
        value['files'].update({p: 'a' * 64 for p in base.BACKGROUND_SOURCE_FILES})
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

    def test_worker_units_have_independent_restart_and_unchanged_parent_budget(self):
        root = Path(__file__).resolve().parents[1] / 'infra/staging'
        for role, unit in zip(workers.ROLES, workers.UNITS):
            content = (root / unit).read_text()
            self.assertIn('ExecStart=/usr/bin/node src/server/worker.ts ' + role, content)
            for line in ('Slice=xdmme-test.slice', 'MemoryMax=160M', 'CPUQuota=10%',
                         'TasksMax=24', 'Restart=on-failure', 'PrivateNetwork=yes'):
                self.assertIn(line, content)
            self.assertNotIn('Requires=0xdmme-test.service', content)
            self.assertEqual('BindPaths=' in content, role != 'ranking')
        parent = (root / 'xdmme-test.slice').read_text()
        self.assertIn('MemoryMax=768M', parent)
        self.assertIn('CPUQuota=50%', parent)
        self.assertIn('TasksMax=128', parent)

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


if __name__ == '__main__':
    unittest.main()
