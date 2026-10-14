"""Exact message transition contracts; no SSH or production database."""
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'infra/staging'))
import deploy_message_changes as messages
import deploy_remote as base
import deploy_blocks45 as backups


class MessageMigrationTests(unittest.TestCase):
    def test_unreviewed_sources_stop_before_database(self):
        with (patch.object(messages, 'REVIEWED', 'UNREVIEWED'),
              patch.object(base, 'reviewed_database') as reviewed,
              patch.object(backups, 'pg') as pg,
              self.assertRaisesRegex(RuntimeError, 'exact source review')):
            messages.review(Path('candidate'), Path('live'))
        reviewed.assert_not_called()
        pg.assert_not_called()

    def test_exact_dispatch_and_existing_lifecycle(self):
        with tempfile.TemporaryDirectory() as directory:
            candidate = Path(directory)
            migrations = candidate / 'src/server/database/migrations'
            migrations.mkdir(parents=True)
            for n in range(1, 67):
                (migrations / ('%03d.sql' % n)).write_text('-- synthetic')
            with patch.object(messages, 'review') as reviewed:
                base.database_review(candidate, Path('live'))
                reviewed.assert_called_once_with(candidate, Path('live'))
        with (patch.object(messages.background, 'verify_current') as healthy,
              patch.object(base, 'activate_database', return_value={'published': True}) as activate):
            messages.activate({}, Path('work'), Path('candidate'), {})
            healthy.assert_called_once()
            contract = activate.call_args.args[3]
            self.assertEqual(contract['versions'], 64)
            self.assertIs(contract['snapshot'], messages.snapshot)
            self.assertIs(contract['verify'], messages.verify_migration)
            self.assertIs(contract['stop_existing'], messages.background.stop)
            self.assertIs(contract['resume_existing'], messages.background.start)

    def test_collision_and_changed_units_stop_before_maintenance(self):
        with (patch.object(base, 'reviewed_database'),
              patch.object(base, 'verify_community_tables'),
              patch.object(base, 'digest', return_value='same'),
              patch.object(backups, 'pg', return_value=b'f'),
              self.assertRaisesRegex(RuntimeError, 'already exist')):
            messages.review(Path('candidate'), Path('live'))
        with (patch.object(base, 'reviewed_database'),
              patch.object(base, 'verify_community_tables'),
              patch.object(base, 'digest', side_effect=['candidate', 'live']),
              patch.object(backups, 'pg') as pg,
              self.assertRaisesRegex(RuntimeError, 'service unit changes')):
            messages.review(Path('candidate'), Path('live'))
        pg.assert_not_called()

    def test_snapshot_omits_only_added_columns_and_reads_all_versions(self):
        with patch.object(backups, 'database_snapshot', return_value={}) as snapshot:
            messages.snapshot()
            snapshot.assert_called_once_with(messages.OLD_TABLES,
                omit_columns={'groups': ('message_revision',), 'group_packets': ('relation',)}, version_limit=66)
        with patch.object(backups, 'node', return_value=b'{"tables":{},"versions":[]}') as node:
            backups.database_snapshot(('accounts',), version_limit=66)
            self.assertIn('ORDER BY version LIMIT 66', node.call_args.args[0])
            backups.database_snapshot(('accounts',))
            self.assertIn('ORDER BY version LIMIT 64', node.call_args.args[0])
        for invalid in [0, 129, '66', True]:
            with self.subTest(value=invalid), patch.object(backups, 'node') as node, self.assertRaisesRegex(RuntimeError, 'migration budget'):
                backups.database_snapshot(('accounts',), version_limit=invalid)
            node.assert_not_called()

    def test_legacy_rows_ledger_checksums_and_new_schema_are_verified(self):
        versions = [{'version': n, 'checksum': str(n)} for n in range(1, 67)]
        before = {'versions': versions[:64], 'tables': {'preserved': 'digest', 'content_usage': 'ledger'}}
        after = dict(before, versions=versions)
        for invalid in [dict(after, versions=versions[:64]), dict(after, tables={'preserved': 'changed'}),
                        dict(after, tables={'preserved': 'digest', 'content_usage': 'changed'})]:
            with (patch.object(messages, 'snapshot', return_value=invalid),
                  patch.object(base, 'attachment_versions', return_value=versions),
                  self.assertRaisesRegex(RuntimeError, 'existing rows, ledger or checksums')):
                messages.verify_migration(Path('candidate'), before)
        with (patch.object(messages, 'snapshot', return_value=after),
              patch.object(base, 'attachment_versions', return_value=versions),
              patch.object(base, 'verify_community_tables'),
              patch.object(backups, 'pg', return_value=b'f'),
              self.assertRaisesRegex(RuntimeError, 'defaults, empty journals')):
            messages.verify_migration(Path('candidate'), before)
        with (patch.object(messages, 'snapshot', return_value=after),
              patch.object(base, 'attachment_versions', return_value=versions),
              patch.object(base, 'verify_community_tables'),
              patch.object(backups, 'pg', return_value=b't')):
            messages.verify_migration(Path('candidate'), before)
