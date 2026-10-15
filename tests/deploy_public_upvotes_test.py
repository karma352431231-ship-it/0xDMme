"""Exact public upvote transition contracts; no SSH or production database."""
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'infra/staging'))
import deploy_public_upvotes as upvotes
import deploy_remote as base
import deploy_blocks45 as backups


class PublicUpvoteMigrationTests(unittest.TestCase):
    def test_unapproved_transition_stops_before_database(self):
        with (patch.object(upvotes, 'REVIEWED', 'UNREVIEWED'),
              patch.object(base, 'reviewed_database') as reviewed,
              patch.object(backups, 'pg') as pg,
              self.assertRaisesRegex(RuntimeError, 'exact source review and approval')):
            upvotes.review(Path('candidate'), Path('live'))
        reviewed.assert_not_called()
        pg.assert_not_called()

    def test_exact_dispatch_reuses_existing_maintenance_and_rollback(self):
        with tempfile.TemporaryDirectory() as directory:
            candidate = Path(directory)
            migrations = candidate / 'src/server/database/migrations'
            migrations.mkdir(parents=True)
            for n in range(1, 69):
                (migrations / ('%03d.sql' % n)).write_text('-- synthetic')
            with patch.object(upvotes, 'review') as reviewed:
                base.database_review(candidate, Path('live'))
                reviewed.assert_called_once_with(candidate, Path('live'))
        with (patch.object(upvotes.background, 'verify_current') as healthy,
              patch.object(base, 'activate_database') as activate):
            upvotes.activate({}, Path('work'), Path('candidate'), {})
            healthy.assert_called_once()
            contract = activate.call_args.args[3]
            self.assertEqual(contract['versions'], 67)
            self.assertIs(contract['snapshot'], upvotes.snapshot)
            self.assertIs(contract['verify'], upvotes.verify_migration)
            self.assertIs(contract['stop_existing'], upvotes.background.stop)
            self.assertIs(contract['resume_existing'], upvotes.background.start)
            self.assertIs(contract['start'], upvotes.background.start)

    def test_review_pins_sources_and_rejects_collisions_or_changed_units(self):
        with (patch.object(base, 'reviewed_database') as reviewed,
              patch.object(base, 'verify_community_tables'),
              patch.object(base, 'digest', return_value='same'),
              patch.object(backups, 'pg', return_value=b't')):
            upvotes.review(Path('candidate'), Path('live'))
            self.assertEqual(reviewed.call_args.args[2], {
                'before': upvotes.BEFORE, 'reviewed': upvotes.REVIEWED,
                'versions': 68, 'previous_versions': 67,
            })
        with (patch.object(base, 'reviewed_database'),
              patch.object(base, 'verify_community_tables'),
              patch.object(base, 'digest', return_value='same'),
              patch.object(backups, 'pg', return_value=b'f'),
              self.assertRaisesRegex(RuntimeError, 'already exists')):
            upvotes.review(Path('candidate'), Path('live'))
        with (patch.object(base, 'reviewed_database'),
              patch.object(base, 'verify_community_tables'),
              patch.object(base, 'digest', side_effect=['new', 'old']),
              patch.object(backups, 'pg') as pg,
              self.assertRaisesRegex(RuntimeError, 'service unit changes')):
            upvotes.review(Path('candidate'), Path('live'))
        pg.assert_not_called()

    def test_preservation_compares_all_old_rows_balance_and_checksums(self):
        with patch.object(backups, 'database_snapshot', return_value={}) as snapshot:
            upvotes.snapshot()
            snapshot.assert_called_once_with(upvotes.OLD_TABLES, version_limit=68)
        versions = list(range(68))
        before = {'versions': versions[:67], 'tables': {'content_usage': 'balance', 'community_votes': 'votes'}}
        after = dict(before, versions=versions)
        for changed in [dict(after, tables={}), dict(after, versions=versions[:67]),
                        dict(after, tables={'content_usage': 'changed', 'community_votes': 'votes'})]:
            with (patch.object(upvotes, 'snapshot', return_value=changed),
                  patch.object(base, 'attachment_versions', return_value=versions),
                  self.assertRaisesRegex(RuntimeError, 'existing rows, ledger or checksums')):
                upvotes.verify_migration(Path('candidate'), before)
        with (patch.object(upvotes, 'snapshot', return_value=after),
              patch.object(base, 'attachment_versions', return_value=versions),
              patch.object(base, 'verify_community_tables'),
              patch.object(backups, 'pg', return_value=b'f'),
              self.assertRaisesRegex(RuntimeError, 'empty table, constraints')):
            upvotes.verify_migration(Path('candidate'), before)
        with (patch.object(upvotes, 'snapshot', return_value=after),
              patch.object(base, 'attachment_versions', return_value=versions),
              patch.object(base, 'verify_community_tables') as tables,
              patch.object(backups, 'pg', return_value=b't')):
            upvotes.verify_migration(Path('candidate'), before)
            tables.assert_called_once_with(upvotes.OLD_TABLES + upvotes.NEW_TABLES)
