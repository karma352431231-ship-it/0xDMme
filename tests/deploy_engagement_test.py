"""Collection activation preserves existing data and requires its exact review."""
import contextlib
import io
from pathlib import Path
import subprocess
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'infra/staging'))
import deploy
import deploy_engagement as metrics
import deploy_remote as base


class EngagementDeploymentTests(unittest.TestCase):
    def test_executor_loads_collection_only_for_its_explicit_mode_within_existing_budgets(self):
        root = Path(__file__).resolve().parents[1]
        files = {'infra/staging/' + path.name: base.digest(path)
                 for path in (root / 'infra/staging').glob('deploy_*.py')}
        code = deploy.executor_code({'files': files, 'engagement': True})
        safe = code.rsplit('print(json.dumps', 1)[0]
        safe += 'assert callable(sys.modules["deploy_engagement"].activate)\n'
        safe += 'assert "deploy_worker_boot" not in sys.modules\n'
        subprocess.run([sys.executable, '-c', safe], check=True, capture_output=True, timeout=10)
        self.assertLess(len(code.encode()), 64 * 1024)
        ordinary = deploy.executor_code({'files': files})
        self.assertNotIn('deploy_engagement', ordinary.rsplit('print(json.dumps', 1)[0])

    def test_review_pins_sources_units_and_reconciled_predecessor(self):
        sql = metrics.previous.directory.ranking.capacity
        with (patch.object(base, 'reviewed_database') as reviewed,
              patch.object(base, 'verify_community_tables'),
              patch.object(base, 'digest', return_value='same'),
              patch.object(sql, 'psql', return_value=b't')):
            metrics.review(Path('candidate'), Path('live'))
        self.assertEqual(reviewed.call_args.args[2], {'before': metrics.BEFORE,
            'reviewed': metrics.REVIEWED, 'versions': 102, 'previous_versions': 99})
        for digests, schema in [(['changed', 'old'], b't'), (['same'] * 8, b'f')]:
            with (patch.object(base, 'reviewed_database'),
                  patch.object(base, 'verify_community_tables'),
                  patch.object(base, 'digest', side_effect=digests),
                  patch.object(sql, 'psql', return_value=schema), self.assertRaises(RuntimeError)):
                metrics.review(Path('candidate'), Path('live'))

    def test_verification_refuses_old_row_history_charge_or_schema_changes(self):
        before = {'versions': list(range(1, 100)), 'tables': {'community_tags': 'same'}, 'ledger': 100}
        after = {'versions': list(range(1, 103)), 'tables': before['tables'], 'ledger': 612}
        sql = metrics.previous.directory.ranking.capacity
        variants = [(dict(after, tables={}), b'512', b't'),
                    (dict(after, versions=[]), b'512', b't'),
                    (dict(after, ledger=613), b'512', b't'),
                    (after, b'512', b'f')]
        for value, charge, valid in variants + [(after, b'512', b't')]:
            with (patch.object(metrics, 'snapshot', return_value=value),
                  patch.object(base, 'attachment_versions', return_value=after['versions']),
                  patch.object(base, 'verify_community_tables'),
                  patch.object(sql, 'psql', side_effect=lambda query: charge if query == metrics.METRIC_CHARGE else valid)):
                if value == after and valid == b't':
                    metrics.verify_migration(Path('candidate'), before)
                else:
                    with self.assertRaises(RuntimeError):
                        metrics.verify_migration(Path('candidate'), before)

    def test_snapshot_preserves_tags_quotas_reserved_columns_and_paged_journals(self):
        batches = metrics.previous.directory.ranking.batches
        with (patch.object(metrics.backups, 'database_snapshot', return_value={'tables': {}}) as small,
              patch.object(batches, 'snapshot', return_value={'message_changes': 'same'}) as paged,
              patch.object(metrics.previous.directory.ranking.capacity, 'psql', return_value=b'100')):
            result = metrics.snapshot()
        self.assertIn('community_tags', small.call_args.args[0])
        self.assertNotIn('message_changes', small.call_args.args[0])
        self.assertEqual(small.call_args.kwargs, {'version_limit': 102, 'include_reserved': True,
            'omit_columns': {'content_usage_legacy': ('used_bytes',)}})
        self.assertEqual(result['ledger'], 100)
        paged.assert_called_once_with(metrics.backups.node, metrics.backups.URL_CHECK)

    def test_activation_requires_approval_and_reuses_backup_and_phase_aware_recovery(self):
        for config in [{}, {'engagement': False}, {'engagement': 1}, {'share_counts': True}]:
            with (patch.object(base, 'activate_database') as activate,
                  self.assertRaisesRegex(RuntimeError, 'explicit --engagement approval')):
                metrics.activate(config, Path('work'), Path('candidate'), {})
            activate.assert_not_called()
        with (patch.object(metrics.background, 'verify_current'),
              patch.object(metrics.previous.directory.ranking.parts, 'require_workers'),
              patch.object(base, 'receipt'),
              patch.object(base, 'activate_database', return_value={'status': 'published'}) as activate):
            result = metrics.activate({'engagement': True}, Path('work'), Path('candidate'), {})
        contract = activate.call_args.args[3]
        self.assertEqual(contract['versions'], 99)
        self.assertIs(contract['snapshot'], metrics.snapshot)
        self.assertIs(contract['verify'], metrics.verify_migration)
        self.assertIs(contract['stop_existing'], metrics.background.stop)
        self.assertIs(contract['resume_existing'], metrics.background.start)
        self.assertEqual(result['engagement_schema_versions'], 102)

    def test_cli_refuses_combined_operational_modes(self):
        for other in ['--prepare', '--share-counts', '--group-fences', '--community-games',
                      '--message-sync', '--post-search', '--contact-invitations',
                      '--profile-directory', '--capacity', '--request-limit', '--media-worker', '--worker-boot']:
            args = ['deploy.py', '--engagement', other]
            if other != '--prepare': args.append('--check')
            with (patch.object(sys, 'argv', args), patch.object(deploy, 'shared_private_workspace'),
                  patch.object(deploy, 'repository') as repository,
                  contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit)):
                deploy.main()
            repository.assert_not_called()

    def test_check_transports_collection_approval_without_activating(self):
        with (patch.object(sys, 'argv', ['deploy.py', '--check', '--engagement']),
              patch.object(deploy, 'shared_private_workspace'),
              patch.object(deploy, 'repository', return_value=('a' * 40, 'main')),
              patch.object(deploy, 'ci', return_value='synthetic-ci'),
              patch.object(deploy, 'prepare', return_value=({'commit': 'a' * 40}, Path('archive'))),
              patch.object(deploy, 'private_inputs', return_value=('synthetic-target', {})),
              patch.object(deploy, 'run'), patch.object(deploy, 'remote', return_value={}) as remote,
              patch('builtins.print')):
            deploy.main()
        self.assertEqual(remote.call_count, 1)
        self.assertEqual(remote.call_args.args[0], 'check')
        self.assertIs(remote.call_args.args[1]['engagement'], True)
