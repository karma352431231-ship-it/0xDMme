"""Group chat activation keeps exact-source, backup and preservation boundaries."""
import contextlib
import io
import subprocess
import sys
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'infra/staging'))
import deploy
import deploy_remote as base
import deploy_group_chat as group

ROOT = Path(__file__).resolve().parents[1]
SQL = group.previous.search.directory.ranking.capacity


class GroupChatDeploymentTests(unittest.TestCase):
    def test_only_explicit_transition_loads_and_stays_within_transport_budget(self):
        files = {'infra/staging/' + p.name: base.digest(p)
                 for p in (ROOT / 'infra/staging').glob('deploy_*.py')}
        code = deploy.executor_code({'files': files, 'group_chat': True})
        safe = code.rsplit('print(json.dumps', 1)[0]
        safe += 'assert callable(sys.modules["deploy_group_chat"].activate)\n'
        safe += 'assert "deploy_view_once" not in sys.modules\n'
        safe += 'assert "deploy_worker_boot" not in sys.modules\n'
        subprocess.run([sys.executable, '-c', safe], check=True, capture_output=True, timeout=10)
        self.assertLess(len(code.encode()), 64 * 1024)
        self.assertNotIn('deploy_group_chat', deploy.executor_code({'files': files}).rsplit('print(json.dumps', 1)[0])
        self.assertEqual(base.TRANSITIONS[109], 'deploy_group_chat')

    def test_review_pins_complete_source_trees_and_refuses_units_or_prior_schema_drift(self):
        with (patch.object(base, 'reviewed_database') as reviewed,
              patch.object(base, 'verify_community_tables'),
              patch.object(base, 'digest', return_value='same'),
              patch.object(SQL, 'psql', return_value=b't')):
            group.review(Path('candidate'), Path('live'))
        self.assertEqual(reviewed.call_args.args[2], {'before': group.BEFORE,
            'reviewed': group.REVIEWED, 'versions': 109, 'previous_versions': 107})
        for digests, check in [(['changed', 'old'], b't'), (['same'] * 8, b'f')]:
            with (patch.object(base, 'reviewed_database'),
                  patch.object(base, 'verify_community_tables'),
                  patch.object(base, 'digest', side_effect=digests),
                  patch.object(SQL, 'psql', return_value=check), self.assertRaises(RuntimeError)):
                group.review(Path('candidate'), Path('live'))

    def test_snapshot_preserves_existing_view_once_and_every_column_with_bounded_large_tables(self):
        batches = group.previous.search.directory.ranking.batches
        with (patch.object(group.previous.backups, 'database_snapshot', return_value={'tables': {}}) as small,
              patch.object(batches, 'snapshot', return_value={'message_changes': 'digest'}) as paged):
            result = group.snapshot()
        self.assertIn('view_once_payloads', small.call_args.args[0])
        self.assertNotIn('message_changes', small.call_args.args[0])
        self.assertEqual(small.call_args.kwargs, {'version_limit': 109, 'include_reserved': True})
        self.assertEqual(paged.call_args.kwargs, {})
        self.assertEqual(result['tables']['message_changes'], 'digest')

    def test_data_ciphertext_checksums_and_reconciliation_drift_refuse_opening(self):
        before = {'versions': list(range(1, 108)), 'tables': {'view_once_payloads': 'ciphertext', 'quota': 'same'}}
        after = {'versions': list(range(1, 110)), 'tables': before['tables']}
        for value in [dict(after, tables={}), dict(after, versions=[])]:
            with (patch.object(group, 'snapshot', return_value=value),
                  patch.object(base, 'attachment_versions', return_value=after['versions']),
                  self.assertRaises(RuntimeError)):
                group.verify_migration(Path('candidate'), before)
        for check in [b't', b'f']:
            with (patch.object(group, 'snapshot', return_value=after),
                  patch.object(base, 'attachment_versions', return_value=after['versions']),
                  patch.object(base, 'verify_community_tables') as tables,
                  patch.object(SQL, 'psql', return_value=check)):
                if check == b't':
                    group.verify_migration(Path('candidate'), before)
                    tables.assert_called_once_with(group.TABLES + group.NEW_TABLES)
                else:
                    with self.assertRaisesRegex(RuntimeError, 'reconciliation'):
                        group.verify_migration(Path('candidate'), before)

    def test_explicit_flag_reuses_backup_and_phase_aware_worker_recovery(self):
        for config in [{}, {'group_chat': False}, {'group_chat': 1}]:
            with (patch.object(base, 'activate_database') as activate,
                  self.assertRaisesRegex(RuntimeError, 'explicit --group-chat approval')):
                group.activate(config, Path('work'), Path('candidate'), {})
            activate.assert_not_called()
        with (patch.object(group.previous.background, 'verify_current'),
              patch.object(group.previous.search.directory.ranking.parts, 'require_workers'),
              patch.object(base, 'receipt'),
              patch.object(base, 'activate_database', return_value={'status': 'published'}) as activate):
            result = group.activate({'group_chat': True}, Path('work'), Path('candidate'), {})
        contract = activate.call_args.args[3]
        self.assertEqual(contract['versions'], 107)
        self.assertIs(contract['snapshot'], group.snapshot)
        self.assertIs(contract['verify'], group.verify_migration)
        self.assertIs(contract['stop_existing'], group.previous.background.stop)
        self.assertIs(contract['resume_existing'], group.previous.background.start)
        self.assertIs(contract['start'], group.previous.background.start)
        self.assertEqual(result['group_chat_schema_versions'], 109)

    def test_cli_rejects_combined_transitions(self):
        for other in ['--prepare', '--view-once', '--visitor-retention', '--capacity', '--worker-boot']:
            args = ['deploy.py', '--group-chat', other]
            if other != '--prepare': args.append('--check')
            with (patch.object(sys, 'argv', args), patch.object(deploy, 'shared_private_workspace'),
                  patch.object(deploy, 'repository') as repository,
                  contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit)):
                deploy.main()
            repository.assert_not_called()

    def test_check_on_explicit_target_transports_approval_without_activating(self):
        with (patch.object(sys, 'argv', ['deploy.py', '--check', '--group-chat']),
              patch.dict('os.environ', {'OXDMME_DEPLOY_TARGET_PROFILE': 'destination'}),
              patch.object(deploy, 'shared_private_workspace'),
              patch.object(deploy, 'LOCAL', Path('private-output')),
              patch.object(deploy.deployment_target, 'profile_directory', return_value=Path('private-profile')),
              patch.object(deploy, 'repository', return_value=('a' * 40, 'main')),
              patch.object(deploy, 'ci', return_value='synthetic-ci'),
              patch.object(deploy, 'prepare', return_value=({'commit': 'a' * 40}, Path('archive'))),
              patch.object(deploy, 'private_inputs', return_value=('synthetic-target', {})) as inputs,
              patch.object(deploy, 'run'), patch.object(deploy, 'remote', return_value={}) as remote,
              patch('builtins.print')):
            deploy.main()
        inputs.assert_called_once_with('destination')
        self.assertEqual(remote.call_count, 1)
        self.assertEqual(remote.call_args.args[0], 'check')
        self.assertIs(remote.call_args.args[1]['group_chat'], True)
