"""Exact public-address migration guards; no remote access or production data."""
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'infra/staging'))
import deploy_community_addresses as addresses
import deploy_remote as base
import deploy_blocks45 as backups
import deploy


class CommunityAddressMigrationTests(unittest.TestCase):
    def test_worktree_keeps_private_inputs_and_artifacts_in_original_checkout(self):
        with (patch.object(deploy, 'run', return_value=b'/original/checkout/.git\n'),
              patch.object(deploy, 'PRIVATE_ROOT'), patch.object(deploy, 'LOCAL')):
            deploy.shared_private_workspace()
            self.assertEqual(deploy.PRIVATE_ROOT, Path('/original/checkout'))
            self.assertEqual(deploy.LOCAL, Path('/original/checkout/.local/deployment'))

    def test_unreviewed_sources_stop_before_database_access(self):
        with (patch.object(addresses, 'REVIEWED', 'UNREVIEWED'),
              patch.object(base, 'reviewed_database') as reviewed,
              patch.object(addresses, 'psql') as pg,
              self.assertRaisesRegex(RuntimeError, 'exact source review')):
            addresses.review(Path('candidate'), Path('live'))
        reviewed.assert_not_called()
        pg.assert_not_called()

    def test_dispatch_keeps_existing_backup_and_rollback_lifecycle(self):
        with tempfile.TemporaryDirectory() as directory:
            candidate = Path(directory)
            migrations = candidate / 'src/server/database/migrations'
            migrations.mkdir(parents=True)
            for version in range(1, 73):
                (migrations / ('%03d.sql' % version)).write_text('-- synthetic')
            with patch.object(addresses, 'review') as reviewed:
                base.database_review(candidate, Path('live'))
                reviewed.assert_called_once_with(candidate, Path('live'))
        with (patch.object(addresses.background, 'verify_current'),
              patch.object(base, 'activate_database') as activate):
            addresses.activate({}, Path('work'), Path('candidate'), {})
            contract = activate.call_args.args[3]
            self.assertEqual(contract['versions'], 71)
            self.assertIs(contract['snapshot'], addresses.snapshot)
            self.assertIs(contract['verify'], addresses.verify_migration)
            self.assertIs(contract['stop_existing'], addresses.background.stop)
            self.assertIs(contract['resume_existing'], addresses.background.start)

    def test_review_pins_database_sources_and_refuses_existing_address_table(self):
        with (patch.object(addresses, 'REVIEWED', 'a' * 40),
              patch.object(base, 'reviewed_database') as reviewed,
              patch.object(base, 'verify_community_tables'),
              patch.object(base, 'digest', return_value='same'),
              patch.object(addresses, 'psql', return_value=b't')):
            addresses.review(Path('candidate'), Path('live'))
            self.assertEqual(reviewed.call_args.args[2], {
                'before': addresses.BEFORE, 'reviewed': addresses.REVIEWED,
                'versions': 72, 'previous_versions': 71,
            })
        with (patch.object(addresses, 'REVIEWED', 'a' * 40),
              patch.object(base, 'reviewed_database'),
              patch.object(base, 'verify_community_tables'),
              patch.object(base, 'digest', return_value='same'),
              patch.object(addresses, 'psql', return_value=b'f'),
              self.assertRaisesRegex(RuntimeError, 'already exists')):
            addresses.review(Path('candidate'), Path('live'))

    def test_snapshot_and_verification_preserve_all_old_rows_and_ledger(self):
        with patch.object(backups, 'database_snapshot', return_value={}) as snapshot:
            addresses.snapshot()
            snapshot.assert_called_once_with(addresses.OLD_TABLES, version_limit=72)
        versions = list(range(72))
        before = {'versions': versions[:71], 'tables': {'content_usage': 'balance', 'communities': 'rows'}}
        after = dict(before, versions=versions)
        for changed in [dict(after, tables={}), dict(after, versions=versions[:71])]:
            with (patch.object(addresses, 'snapshot', return_value=changed),
                  patch.object(base, 'attachment_versions', return_value=versions),
                  self.assertRaises(RuntimeError)):
                addresses.verify_migration(Path('candidate'), before)
        with (patch.object(addresses, 'snapshot', return_value=after),
              patch.object(base, 'attachment_versions', return_value=versions),
              patch.object(base, 'verify_community_tables') as tables,
              patch.object(addresses, 'psql', return_value=b't')):
            addresses.verify_migration(Path('candidate'), before)
            tables.assert_called_once_with(addresses.OLD_TABLES + addresses.NEW_TABLES)
        with (patch.object(addresses, 'snapshot', return_value=after),
              patch.object(base, 'attachment_versions', return_value=versions),
              patch.object(base, 'verify_community_tables'),
              patch.object(addresses, 'psql', return_value=b'f'),
              self.assertRaisesRegex(RuntimeError, 'uniqueness')):
            addresses.verify_migration(Path('candidate'), before)


if __name__ == '__main__':
    unittest.main()
