"""Exact ranking activity transition contracts; no SSH or production database."""
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'infra/staging'))
import deploy_ranking_activity as ranking
import deploy_remote as base
import deploy_blocks45 as backups


class RankingActivityMigrationTests(unittest.TestCase):
    def test_unapproved_transition_stops_before_database(self):
        with (patch.object(ranking, 'REVIEWED', 'UNREVIEWED'),
              patch.object(base, 'reviewed_database') as reviewed,
              patch.object(backups, 'pg') as pg,
              self.assertRaisesRegex(RuntimeError, 'exact source review and approval')):
            ranking.review(Path('candidate'), Path('live'))
        reviewed.assert_not_called()
        pg.assert_not_called()

    def test_exact_dispatch_reuses_existing_maintenance_and_rollback(self):
        with tempfile.TemporaryDirectory() as directory:
            candidate = Path(directory)
            migrations = candidate / 'src/server/database/migrations'
            migrations.mkdir(parents=True)
            for n in range(1, 71):
                (migrations / ('%03d.sql' % n)).write_text('-- synthetic')
            with patch.object(ranking, 'review') as reviewed:
                base.database_review(candidate, Path('live'))
                reviewed.assert_called_once_with(candidate, Path('live'))
        with (patch.object(ranking.background, 'verify_current') as healthy,
              patch.object(base, 'activate_database') as activate):
            ranking.activate({}, Path('work'), Path('candidate'), {})
            healthy.assert_called_once()
            contract = activate.call_args.args[3]
            self.assertEqual(contract['versions'], 69)
            self.assertIs(contract['snapshot'], ranking.snapshot)
            self.assertIs(contract['verify'], ranking.verify_migration)
            self.assertIs(contract['stop_existing'], ranking.background.stop)
            self.assertIs(contract['resume_existing'], ranking.background.start)
            self.assertIs(contract['start'], ranking.background.start)

    def test_review_pins_sources_and_rejects_collisions_or_changed_units(self):
        with (patch.object(base, 'reviewed_database') as reviewed,
              patch.object(base, 'verify_community_tables'),
              patch.object(base, 'digest', return_value='same'),
              patch.object(backups, 'pg', return_value=b't')):
            ranking.review(Path('candidate'), Path('live'))
            self.assertEqual(reviewed.call_args.args[2], {
                'before': ranking.BEFORE, 'reviewed': ranking.REVIEWED,
                'versions': 70, 'previous_versions': 69,
            })
        with (patch.object(base, 'reviewed_database'),
              patch.object(base, 'verify_community_tables'),
              patch.object(base, 'digest', return_value='same'),
              patch.object(backups, 'pg', return_value=b'f'),
              self.assertRaisesRegex(RuntimeError, 'already exist')):
            ranking.review(Path('candidate'), Path('live'))
        with (patch.object(base, 'reviewed_database'),
              patch.object(base, 'verify_community_tables'),
              patch.object(base, 'digest', side_effect=['new', 'old']),
              patch.object(backups, 'pg') as pg,
              self.assertRaisesRegex(RuntimeError, 'service unit changes')):
            ranking.review(Path('candidate'), Path('live'))
        pg.assert_not_called()

    def test_snapshot_omits_only_the_two_added_columns(self):
        with patch.object(backups, 'database_snapshot', return_value={}) as snapshot:
            ranking.snapshot()
            snapshot.assert_called_once_with(ranking.OLD_TABLES, omit_columns={
                'community_votes': ('voted_at',),
                'community_ranking_entries': ('previous_participants',),
            }, version_limit=70)

    def test_preservation_compares_all_old_rows_balance_and_checksums(self):
        versions = list(range(70))
        before = {'versions': versions[:69], 'tables': {'content_usage': 'balance', 'community_votes': 'votes'}}
        after = dict(before, versions=versions)
        for changed, error in [(dict(after, tables={}), 'existing rows or ledger'),
                               (dict(after, versions=versions[:69]), 'migration sequence or checksums'),
                               (dict(after, tables={'content_usage': 'changed', 'community_votes': 'votes'}), 'existing rows or ledger')]:
            with (patch.object(ranking, 'snapshot', return_value=changed),
                  patch.object(base, 'attachment_versions', return_value=versions),
                  self.assertRaisesRegex(RuntimeError, error)):
                ranking.verify_migration(Path('candidate'), before)
        with (patch.object(ranking, 'snapshot', return_value=after),
              patch.object(base, 'attachment_versions', return_value=versions),
              patch.object(base, 'verify_community_tables'),
              patch.object(backups, 'pg', return_value=b'f'),
              self.assertRaisesRegex(RuntimeError, 'columns, defaults, empty values or index')):
            ranking.verify_migration(Path('candidate'), before)
        with (patch.object(ranking, 'snapshot', return_value=after),
              patch.object(base, 'attachment_versions', return_value=versions),
              patch.object(base, 'verify_community_tables') as tables,
              patch.object(backups, 'pg', return_value=b't')):
            ranking.verify_migration(Path('candidate'), before)
            tables.assert_called_once_with(ranking.OLD_TABLES)
