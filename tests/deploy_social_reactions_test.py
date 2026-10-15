"""Exact reaction index transition contracts; no SSH or production database."""
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'infra/staging'))
import deploy_social_reactions as reactions
import deploy_remote as base
import deploy_blocks45 as backups


class ReactionIndexMigrationTests(unittest.TestCase):
    def test_unapproved_transition_stops_before_database(self):
        with (patch.object(reactions, 'REVIEWED', 'UNREVIEWED'),
              patch.object(base, 'reviewed_database') as reviewed,
              patch.object(backups, 'pg') as pg,
              self.assertRaisesRegex(RuntimeError, 'exact source review and approval')):
            reactions.review(Path('candidate'), Path('live'))
        reviewed.assert_not_called()
        pg.assert_not_called()

    def test_exact_dispatch_reuses_existing_maintenance_and_rollback(self):
        with tempfile.TemporaryDirectory() as directory:
            candidate = Path(directory)
            migrations = candidate / 'src/server/database/migrations'
            migrations.mkdir(parents=True)
            for n in range(1, 70):
                (migrations / ('%03d.sql' % n)).write_text('-- synthetic')
            with patch.object(reactions, 'review') as reviewed:
                base.database_review(candidate, Path('live'))
                reviewed.assert_called_once_with(candidate, Path('live'))
        with (patch.object(reactions.background, 'verify_current') as healthy,
              patch.object(base, 'activate_database') as activate):
            reactions.activate({}, Path('work'), Path('candidate'), {})
            healthy.assert_called_once()
            contract = activate.call_args.args[3]
            self.assertEqual(contract['versions'], 68)
            self.assertIs(contract['snapshot'], reactions.snapshot)
            self.assertIs(contract['verify'], reactions.verify_migration)
            self.assertIs(contract['stop_existing'], reactions.background.stop)
            self.assertIs(contract['resume_existing'], reactions.background.start)
            self.assertIs(contract['start'], reactions.background.start)

    def test_review_pins_sources_and_rejects_collisions_or_changed_units(self):
        with (patch.object(base, 'reviewed_database') as reviewed,
              patch.object(base, 'verify_community_tables'),
              patch.object(base, 'digest', return_value='same'),
              patch.object(backups, 'pg', return_value=b't')):
            reactions.review(Path('candidate'), Path('live'))
            self.assertEqual(reviewed.call_args.args[2], {
                'before': reactions.BEFORE, 'reviewed': reactions.REVIEWED,
                'versions': 69, 'previous_versions': 68,
            })
        with (patch.object(base, 'reviewed_database'),
              patch.object(base, 'verify_community_tables'),
              patch.object(base, 'digest', return_value='same'),
              patch.object(backups, 'pg', return_value=b'f'),
              self.assertRaisesRegex(RuntimeError, 'already exists')):
            reactions.review(Path('candidate'), Path('live'))
        with (patch.object(base, 'reviewed_database'),
              patch.object(base, 'verify_community_tables'),
              patch.object(base, 'digest', side_effect=['new', 'old']),
              patch.object(backups, 'pg') as pg,
              self.assertRaisesRegex(RuntimeError, 'service unit changes')):
            reactions.review(Path('candidate'), Path('live'))
        pg.assert_not_called()

    def test_preservation_compares_all_old_rows_balance_and_checksums(self):
        with patch.object(backups, 'database_snapshot', return_value={}) as snapshot:
            reactions.snapshot()
            snapshot.assert_called_once_with(reactions.OLD_TABLES, version_limit=69)
        versions = list(range(69))
        before = {'versions': versions[:68], 'tables': {'content_usage': 'balance', 'community_votes': 'votes'}}
        after = dict(before, versions=versions)
        for changed in [dict(after, tables={}), dict(after, versions=versions[:68]),
                        dict(after, tables={'content_usage': 'changed', 'community_votes': 'votes'})]:
            with (patch.object(reactions, 'snapshot', return_value=changed),
                  patch.object(base, 'attachment_versions', return_value=versions),
                  self.assertRaisesRegex(RuntimeError, 'existing rows, ledger or checksums')):
                reactions.verify_migration(Path('candidate'), before)
        with (patch.object(reactions, 'snapshot', return_value=after),
              patch.object(base, 'attachment_versions', return_value=versions),
              patch.object(base, 'verify_community_tables'),
              patch.object(backups, 'pg', return_value=b'f'),
              self.assertRaisesRegex(RuntimeError, 'target, keys, predicate')):
            reactions.verify_migration(Path('candidate'), before)
        with (patch.object(reactions, 'snapshot', return_value=after),
              patch.object(base, 'attachment_versions', return_value=versions),
              patch.object(base, 'verify_community_tables') as tables,
              patch.object(backups, 'pg', return_value=b't')):
            reactions.verify_migration(Path('candidate'), before)
            tables.assert_called_once_with(reactions.OLD_TABLES)
