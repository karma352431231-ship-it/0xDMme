"""Public share counts use one exact, backed-up 098→099 release transition."""
import contextlib
import io
from pathlib import Path
import subprocess
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'infra/staging'))
import deploy
import deploy_post_share_counts as counts
import deploy_remote as base


class ShareCountDeploymentTests(unittest.TestCase):
    def test_executor_loads_its_explicit_contract_inside_existing_budgets(self):
        root = Path(__file__).resolve().parents[1]
        files = {'infra/staging/' + path.name: base.digest(path)
                 for path in (root / 'infra/staging').glob('deploy_*.py')}
        code = deploy.executor_code({'files': files, 'share_counts': True})
        safe = code.rsplit('print(json.dumps', 1)[0]
        safe += 'assert callable(sys.modules["deploy_post_share_counts"].activate)\n'
        safe += 'assert "deploy_worker_boot" not in sys.modules\n'
        subprocess.run([sys.executable, '-c', safe], check=True, capture_output=True, timeout=10)
        self.assertLess(len(code.encode()), 64 * 1024)
        ordinary = deploy.executor_code({'files': files})
        self.assertNotIn('deploy_post_share_counts', ordinary.rsplit('print(json.dumps', 1)[0])

    def test_review_pins_both_complete_sources_and_rejects_schema_or_unit_drift(self):
        sql = counts.previous.directory.ranking.capacity
        with (patch.object(base, 'reviewed_database') as reviewed,
              patch.object(base, 'verify_community_tables'),
              patch.object(base, 'digest', return_value='same'),
              patch.object(sql, 'psql', return_value=b't')):
            counts.review(Path('candidate'), Path('live'))
        self.assertEqual(reviewed.call_args.args[2], {'before': counts.BEFORE,
            'reviewed': counts.REVIEWED, 'versions': 99, 'previous_versions': 98})
        for digests, schema in [(['changed', 'old'], b't'), (['same'] * 8, b'f')]:
            with (patch.object(base, 'reviewed_database'),
                  patch.object(base, 'verify_community_tables'),
                  patch.object(base, 'digest', side_effect=digests),
                  patch.object(sql, 'psql', return_value=schema), self.assertRaises(RuntimeError)):
                counts.review(Path('candidate'), Path('live'))

    def test_changed_preserved_rows_history_or_schema_refuses_publication(self):
        before = {'versions': list(range(1, 99)), 'tables': {'community_post_shares': 'same', 'quota': 'same'}}
        after = {'versions': list(range(1, 100)), 'tables': before['tables']}
        for value in [dict(after, tables={}), dict(after, versions=[])]:
            with (patch.object(counts, 'snapshot', return_value=value),
                  patch.object(base, 'attachment_versions', return_value=after['versions']),
                  self.assertRaises(RuntimeError)):
                counts.verify_migration(Path('candidate'), before)
        for check in [b't', b'f']:
            with (patch.object(counts, 'snapshot', return_value=after),
                  patch.object(base, 'attachment_versions', return_value=after['versions']),
                  patch.object(base, 'verify_community_tables'),
                  patch.object(counts.previous.directory.ranking.capacity, 'psql', return_value=check)):
                if check == b't': counts.verify_migration(Path('candidate'), before)
                else:
                    with self.assertRaisesRegex(RuntimeError, 'reconciliation'):
                        counts.verify_migration(Path('candidate'), before)

    def test_snapshot_compares_every_preserved_table_and_keeps_journal_pagination(self):
        batches = counts.previous.directory.ranking.batches
        with (patch.object(counts.backups, 'database_snapshot', return_value={'tables': {}}) as small,
              patch.object(batches, 'snapshot', return_value={'message_changes': 'digest'}) as paged):
            counts.snapshot()
        self.assertIn('community_post_shares', small.call_args.args[0])
        self.assertNotIn('message_changes', small.call_args.args[0])
        self.assertEqual(small.call_args.kwargs, {'version_limit': 99, 'include_reserved': True})
        self.assertEqual(paged.call_args.kwargs, {})

    def test_explicit_flag_reuses_verified_backup_and_phase_aware_worker_recovery(self):
        for config in [{}, {'share_counts': False}, {'share_counts': 1}, {'group_fences': True}]:
            with (patch.object(base, 'activate_database') as activate,
                  self.assertRaisesRegex(RuntimeError, 'explicit --share-counts approval')):
                counts.activate(config, Path('work'), Path('candidate'), {})
            activate.assert_not_called()
        with (patch.object(counts.background, 'verify_current'),
              patch.object(counts.previous.directory.ranking.parts, 'require_workers'),
              patch.object(base, 'receipt'),
              patch.object(base, 'activate_database', return_value={'status': 'published'}) as activate):
            result = counts.activate({'share_counts': True}, Path('work'), Path('candidate'), {})
        contract = activate.call_args.args[3]
        self.assertEqual(contract['versions'], 98)
        self.assertIs(contract['snapshot'], counts.snapshot)
        self.assertIs(contract['verify'], counts.verify_migration)
        self.assertIs(contract['stop_existing'], counts.background.stop)
        self.assertIs(contract['resume_existing'], counts.background.start)
        self.assertEqual(result['share_counts_schema_versions'], 99)

    def test_cli_refuses_other_operational_transitions(self):
        for other in ['--prepare', '--group-fences', '--community-games', '--message-sync', '--post-search',
                      '--contact-invitations', '--profile-directory', '--capacity',
                      '--request-limit', '--media-worker', '--worker-boot']:
            args = ['deploy.py', '--share-counts', other]
            if other != '--prepare': args.append('--check')
            with (patch.object(sys, 'argv', args), patch.object(deploy, 'shared_private_workspace'),
                  patch.object(deploy, 'repository') as repository,
                  contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit)):
                deploy.main()
            repository.assert_not_called()

    def test_check_transports_approval_without_activating(self):
        with (patch.object(sys, 'argv', ['deploy.py', '--check', '--share-counts']),
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
        self.assertIs(remote.call_args.args[1]['share_counts'], True)
