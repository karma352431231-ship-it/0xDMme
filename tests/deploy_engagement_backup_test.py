"""Temporary metric identifiers never enter aggregate backup data."""

import json
import os
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'infra/staging'))
import deploy_engagement_backup as policy
from deploy_backup_io import restore_transaction

LISTING = b'42; 1259 123 TABLE hash_talk engagement_state owner\n'


class MetricBackupTests(unittest.TestCase):
    def test_detects_legacy_schema_and_rejects_unavailable_or_malformed_accounting(self):
        self.assertIsNone(policy.temporary_bytes(lambda *_: b'f\n'))
        self.assertEqual(policy.dump_options(None), [])
        for response in [b'', b'unknown', b'9007199254740992', b'-1']:
            calls = iter([b't', response])
            with self.assertRaises(RuntimeError):
                policy.temporary_bytes(lambda *_: next(calls))
        calls = iter([b't', b'512'])
        self.assertEqual(policy.temporary_bytes(lambda *_: next(calls)), 512)
        self.assertEqual(set(policy.dump_options(512)), {
            '--exclude-table-data=hash_talk.' + table for table in policy.TABLES})

    def test_manifest_has_only_aggregate_accounting_and_binds_the_dump(self):
        with tempfile.TemporaryDirectory() as directory:
            work = Path(directory)
            policy.record(work, 512, 'a' * 64)
            manifest = work / policy.MANIFEST
            self.assertEqual(manifest.stat().st_mode & 0o777, 0o600)
            self.assertEqual(set(json.loads(manifest.read_text())), {
                'version', 'dump_sha256', 'excluded_charge_bytes'})
            sql = policy.restore_sql(work, 'a' * 64, listing=LISTING)
            self.assertIn(b'used_bytes=used_bytes-512', sql)
            self.assertIn(b'contributors_reset_at', sql)
            with self.assertRaisesRegex(RuntimeError, 'differs'):
                policy.restore_sql(work, 'b' * 64, listing=LISTING)
            with self.assertRaises(FileExistsError):
                policy.record(work, 512, 'a' * 64)

    def test_missing_manifest_raw_identifier_data_and_symlinks_fail_before_restore(self):
        with tempfile.TemporaryDirectory() as directory:
            work = Path(directory)
            self.assertEqual(policy.restore_sql(work, 'a' * 64, listing=b''), b'')
            with self.assertRaisesRegex(RuntimeError, 'missing'):
                policy.restore_sql(work, 'a' * 64, listing=LISTING)
            policy.record(work, 512, 'a' * 64)
            for table in policy.TABLES:
                with self.assertRaisesRegex(RuntimeError, 'data section'):
                    policy.restore_sql(work, 'a' * 64,
                        listing=LISTING + ('TABLE DATA hash_talk ' + table + ' owner').encode())
            (work / policy.MANIFEST).unlink()
            (work / policy.MANIFEST).symlink_to(work / 'missing')
            with self.assertRaisesRegex(RuntimeError, 'irregular'):
                policy.restore_sql(work, 'a' * 64, listing=LISTING)

    def test_accounting_and_coverage_changes_are_inside_the_atomic_restore(self):
        content = []
        def execute(args, **options):
            if args[0] == 'pg_restore':
                options['output'].write(b'-- synthetic dump\n')
            else:
                self.assertEqual(Path(options['input_file'].name).stat().st_mode & 0o077, 0)
                content.append(options['input_file'].read())
        with tempfile.TemporaryDirectory() as directory:
            work = Path(directory)
            restore_transaction(work, work / 'dump', execute, rollback=True,
                                after_restore=b'SELECT 42;\n')
            self.assertEqual(list(work.iterdir()), [])
        self.assertTrue(content[0].endswith(b'SELECT 42;\n\nROLLBACK;\n'))


if __name__ == '__main__':
    unittest.main()
