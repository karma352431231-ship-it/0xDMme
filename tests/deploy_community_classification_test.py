"""Classification migration guards. No VPS, SSH or production database."""
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'infra/staging'))
import deploy_community_classification as classification
import deploy_remote as base
import deploy_blocks45 as backups


class ClassificationMigrationTests(unittest.TestCase):
    def test_unapproved_transition_stops_before_database(self):
        with (patch.object(classification, 'REVIEWED', 'UNREVIEWED'),
              patch.object(base, 'reviewed_database') as reviewed,
              patch.object(backups, 'pg') as pg,
              self.assertRaisesRegex(RuntimeError, 'exact source review and approval')):
            classification.review(Path('candidate'), Path('live'))
        reviewed.assert_not_called()
        pg.assert_not_called()

    def test_dispatch_uses_existing_maintenance_and_rollback(self):
        with tempfile.TemporaryDirectory() as directory:
            candidate = Path(directory)
            migrations = candidate / 'src/server/database/migrations'
            migrations.mkdir(parents=True)
            for n in range(1, 68):
                (migrations / ('%03d.sql' % n)).write_text('-- synthetic')
            with patch.object(classification, 'review') as reviewed:
                base.database_review(candidate, Path('live'))
                reviewed.assert_called_once_with(candidate, Path('live'))
        with (patch.object(classification.background, 'verify_current'),
              patch.object(base, 'activate_database') as activate):
            classification.activate({}, Path('work'), Path('candidate'), {})
            contract = activate.call_args.args[3]
            self.assertEqual(contract['versions'], 66)
            self.assertIs(contract['stop_existing'], classification.background.stop)
            self.assertIs(contract['resume_existing'], classification.background.start)
            self.assertIs(contract['verify'], classification.verify_migration)

    def test_preservation_compares_every_old_row_and_balance(self):
        with patch.object(backups, 'database_snapshot', return_value={}) as snapshot:
            classification.snapshot()
            snapshot.assert_called_once_with(classification.OLD_TABLES,
                omit_columns={'public_moderation': ('publication_mode',)}, version_limit=67)
        versions = list(range(67))
        before = {'versions': versions[:66], 'tables': {'content_usage': 'balance', 'communities': 'original'}}
        after = dict(before, versions=versions)
        for changed in [dict(after, tables={}), dict(after, versions=versions[:66])]:
            with (patch.object(classification, 'snapshot', return_value=changed),
                  patch.object(base, 'attachment_versions', return_value=versions),
                  self.assertRaisesRegex(RuntimeError, 'existing rows, ledger or checksums')):
                classification.verify_migration(Path('candidate'), before)
        with (patch.object(classification, 'snapshot', return_value=after),
              patch.object(base, 'attachment_versions', return_value=versions),
              patch.object(base, 'verify_community_tables'),
              patch.object(backups, 'pg', return_value=b'f'),
              self.assertRaisesRegex(RuntimeError, 'defaults, empty table')):
            classification.verify_migration(Path('candidate'), before)

    def test_collisions_and_changed_services_are_refused(self):
        with (patch.object(classification, 'REVIEWED', 'a'*40),
              patch.object(base, 'reviewed_database'),
              patch.object(base, 'verify_community_tables'),
              patch.object(base, 'digest', return_value='same'),
              patch.object(backups, 'pg', return_value=b'f'),
              self.assertRaisesRegex(RuntimeError, 'already exists')):
            classification.review(Path('candidate'), Path('live'))
        with (patch.object(classification, 'REVIEWED', 'a'*40),
              patch.object(base, 'reviewed_database'),
              patch.object(base, 'verify_community_tables'),
              patch.object(base, 'digest', side_effect=['new', 'old']),
              self.assertRaisesRegex(RuntimeError, 'service unit changes')):
            classification.review(Path('candidate'), Path('live'))
