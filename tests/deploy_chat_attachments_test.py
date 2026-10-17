"""Exact chat attachment limit transition contracts; no SSH or production database."""
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'infra/staging'))
import deploy_chat_attachments as chat
import deploy_remote as base
import deploy_blocks45 as backups


class ChatAttachmentMigrationTests(unittest.TestCase):
    def test_unapproved_transition_stops_before_database(self):
        with (patch.object(chat, 'REVIEWED', 'UNREVIEWED'),
              patch.object(base, 'reviewed_database') as reviewed,
              patch.object(backups, 'pg') as pg,
              self.assertRaisesRegex(RuntimeError, 'exact source review and approval')):
            chat.review(Path('candidate'), Path('live'))
        reviewed.assert_not_called()
        pg.assert_not_called()

    def test_exact_dispatch_reuses_existing_maintenance_and_rollback(self):
        with tempfile.TemporaryDirectory() as directory:
            candidate = Path(directory)
            migrations = candidate / 'src/server/database/migrations'
            migrations.mkdir(parents=True)
            for n in range(1, 72):
                (migrations / ('%03d.sql' % n)).write_text('-- synthetic')
            with patch.object(chat, 'review') as reviewed:
                base.database_review(candidate, Path('live'))
                reviewed.assert_called_once_with(candidate, Path('live'))
        with (patch.object(chat.background, 'verify_current') as healthy,
              patch.object(base, 'activate_database') as activate):
            chat.activate({}, Path('work'), Path('candidate'), {})
            healthy.assert_called_once()
            contract = activate.call_args.args[3]
            self.assertEqual(contract['versions'], 70)
            self.assertIs(contract['snapshot'], chat.snapshot)
            self.assertIs(contract['verify'], chat.verify_migration)
            self.assertIs(contract['stop_existing'], chat.background.stop)
            self.assertIs(contract['resume_existing'], chat.background.start)
            self.assertIs(contract['start'], chat.background.start)

    def test_review_pins_sources_and_rejects_collisions_or_changed_units(self):
        with (patch.object(base, 'reviewed_database') as reviewed,
              patch.object(base, 'verify_community_tables'),
              patch.object(base, 'digest', return_value='same'),
              patch.object(backups, 'pg', return_value=chat.BEFORE_CHECKS.encode()),
              patch.object(chat, 'REVIEWED', 'a' * 40)):
            chat.review(Path('candidate'), Path('live'))
            self.assertEqual(reviewed.call_args.args[2], {
                'before': chat.BEFORE, 'reviewed': chat.REVIEWED,
                'versions': 71, 'previous_versions': 70,
            })
        with (patch.object(base, 'reviewed_database'),
              patch.object(base, 'verify_community_tables'),
              patch.object(base, 'digest', return_value='same'),
              patch.object(backups, 'pg', return_value=chat.AFTER_CHECKS.encode()),
              patch.object(chat, 'REVIEWED', 'a' * 40),
              self.assertRaisesRegex(RuntimeError, 'reviewed 3 MB state')):
            chat.review(Path('candidate'), Path('live'))
        with (patch.object(base, 'reviewed_database'),
              patch.object(base, 'verify_community_tables'),
              patch.object(base, 'digest', side_effect=['new', 'old']),
              patch.object(backups, 'pg') as pg,
              patch.object(chat, 'REVIEWED', 'a' * 40),
              self.assertRaisesRegex(RuntimeError, 'service unit changes')):
            chat.review(Path('candidate'), Path('live'))
        pg.assert_not_called()

    def test_snapshot_compares_every_column_of_every_old_row(self):
        with patch.object(backups, 'database_snapshot', return_value={}) as snapshot:
            chat.snapshot()
            snapshot.assert_called_once_with(chat.OLD_TABLES, version_limit=71)

    def test_preservation_compares_all_old_rows_balance_and_checksums(self):
        versions = list(range(71))
        before = {'versions': versions[:70], 'tables': {'content_usage': 'balance', 'message_attachments': 'files'}}
        after = dict(before, versions=versions)
        for changed, error in [(dict(after, tables={}), 'existing rows or ledger'),
                               (dict(after, versions=versions[:70]), 'migration sequence or checksums'),
                               (dict(after, tables={'content_usage': 'changed', 'message_attachments': 'files'}), 'existing rows or ledger')]:
            with (patch.object(chat, 'snapshot', return_value=changed),
                  patch.object(base, 'attachment_versions', return_value=versions),
                  self.assertRaisesRegex(RuntimeError, error)):
                chat.verify_migration(Path('candidate'), before)
        with (patch.object(chat, 'snapshot', return_value=after),
              patch.object(base, 'attachment_versions', return_value=versions),
              patch.object(base, 'verify_community_tables'),
              patch.object(backups, 'pg', return_value=chat.BEFORE_CHECKS.encode()),
              self.assertRaisesRegex(RuntimeError, 'validated 10 MB bounds')):
            chat.verify_migration(Path('candidate'), before)
        with (patch.object(chat, 'snapshot', return_value=after),
              patch.object(base, 'attachment_versions', return_value=versions),
              patch.object(base, 'verify_community_tables') as tables,
              patch.object(backups, 'pg', return_value=chat.AFTER_CHECKS.encode())):
            chat.verify_migration(Path('candidate'), before)
            tables.assert_called_once_with(chat.OLD_TABLES)
