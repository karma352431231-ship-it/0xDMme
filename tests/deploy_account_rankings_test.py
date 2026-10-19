"""Ranking activation guards; synthetic snapshots and no external operations."""
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'infra/staging'))
import deploy_account_rankings as ranking
import deploy_remote as base
import deploy_blocks45 as backups


class AccountRankingDeploymentTests(unittest.TestCase):
    def test_review_requires_exact_sources_unchanged_units_and_absent_tables(self):
        with (patch.object(ranking, 'REVIEWED', 'unreviewed'),
              patch.object(base, 'reviewed_database') as source,
              self.assertRaisesRegex(RuntimeError, 'exact source review')):
            ranking.review(Path('candidate'), Path('live'))
        source.assert_not_called()
        for units, absent in [(['different', 'old'], b't'), (['same'] * 8, b'f')]:
            with (patch.object(base, 'reviewed_database'),
                  patch.object(base, 'verify_community_tables'),
                  patch.object(base, 'digest', side_effect=units),
                  patch.object(ranking.capacity, 'psql', return_value=absent),
                  self.assertRaises(RuntimeError)):
                ranking.review(Path('candidate'), Path('live'))
        with (patch.object(base, 'reviewed_database') as source,
              patch.object(base, 'verify_community_tables'),
              patch.object(base, 'digest', return_value='same'),
              patch.object(ranking.capacity, 'psql', return_value=b't')):
            ranking.review(Path('candidate'), Path('live'))
        self.assertEqual(source.call_args.args[2], {'before': ranking.BEFORE,
            'reviewed': ranking.REVIEWED, 'versions': 92, 'previous_versions': 91})

    def test_snapshot_keeps_reserved_bytes_and_separately_measures_the_ledger(self):
        with (patch.object(backups, 'database_snapshot', return_value={'tables': {}}) as snapshot,
              patch.object(ranking.batches, 'snapshot', return_value={'message_changes': 'paged'}),
              patch.object(ranking.capacity, 'psql', return_value=b'8128')):
            self.assertEqual(ranking.snapshot()['ledger'], 8128)
        small = tuple(name for name in ranking.TABLES if name not in ranking.batches.KEYS)
        snapshot.assert_called_once_with(small, omit_columns=ranking.OMIT_COLUMNS,
            version_limit=92, include_reserved=True)
        self.assertEqual(ranking.OMIT_COLUMNS['content_usage_legacy'], ('used_bytes',))
        self.assertNotIn('content_usage_partitions', ranking.OMIT_COLUMNS)

    def test_preserves_old_rows_checksums_and_only_accepts_exact_seed_charge(self):
        versions = list(range(92))
        before = {'versions': versions[:91], 'tables': {'source': 'unchanged'}, 'ledger': 1000}
        after = dict(before, versions=versions, ledger=1512)
        for changed in [dict(after, versions=[]), dict(after, tables={}), dict(after, ledger=1511)]:
            with (patch.object(ranking, 'snapshot', return_value=changed),
                  patch.object(base, 'attachment_versions', return_value=versions),
                  patch.object(ranking.capacity, 'psql', return_value=b'512'),
                  self.assertRaises(RuntimeError)):
                ranking.verify_migration(Path('candidate'), before)
        for failed_check in range(3):
            results = [b'512'] + [b'f' if i == failed_check else b't' for i in range(3)]
            with (patch.object(ranking, 'snapshot', return_value=after),
                  patch.object(base, 'attachment_versions', return_value=versions),
                  patch.object(base, 'verify_community_tables'),
                  patch.object(ranking.capacity, 'psql', side_effect=results),
                  self.assertRaisesRegex(RuntimeError, 'reconciliation failed')):
                ranking.verify_migration(Path('candidate'), before)
        with (patch.object(ranking, 'snapshot', return_value=after),
              patch.object(base, 'attachment_versions', return_value=versions),
              patch.object(base, 'verify_community_tables'),
              patch.object(ranking.capacity, 'psql', side_effect=[b'512', b't', b't', b't'])):
            ranking.verify_migration(Path('candidate'), before)

    def test_uses_existing_maintenance_backup_and_phase_aware_recovery(self):
        with tempfile.TemporaryDirectory() as directory:
            candidate = Path(directory)
            migrations = candidate / 'src/server/database/migrations'
            migrations.mkdir(parents=True)
            for number in range(1, 93):
                (migrations / ('%03d.sql' % number)).write_text('-- synthetic')
            with patch.object(ranking, 'review') as reviewed:
                base.database_review(candidate, Path('live'))
            reviewed.assert_called_once_with(candidate, Path('live'))
        with (patch.object(ranking.background, 'verify_current'),
              patch.object(ranking.parts, 'require_workers', side_effect=RuntimeError('not ready')),
              patch.object(base, 'activate_database') as activate,
              self.assertRaisesRegex(RuntimeError, 'not ready')):
            ranking.activate({}, Path('work'), Path('candidate'), {})
        activate.assert_not_called()
        with (patch.object(ranking.background, 'verify_current'),
              patch.object(ranking.parts, 'require_workers'),
              patch.object(base, 'receipt'),
              patch.object(base, 'activate_database', return_value={'status': 'published'}) as activate):
            result = ranking.activate({}, Path('work'), Path('candidate'), {})
        contract = activate.call_args.args[3]
        self.assertEqual(contract['versions'], 91)
        self.assertIs(contract['snapshot'], ranking.snapshot)
        self.assertIs(contract['verify'], ranking.verify_migration)
        self.assertIs(contract['stop_existing'], ranking.background.stop)
        self.assertIs(contract['resume_existing'], ranking.background.start)
        self.assertIs(contract['start'], ranking.background.start)
        self.assertNotIn('install', contract)
        self.assertEqual(result['account_ranking_schema_versions'], 92)
