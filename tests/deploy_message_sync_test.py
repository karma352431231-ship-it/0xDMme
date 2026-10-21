"""Finite message synchronization uses one exact, backed-up release transition."""
import contextlib
import io
from pathlib import Path
import subprocess
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'infra/staging'))
import deploy
import deploy_message_sync as sync
import deploy_remote as base


class MessageSyncDeploymentTests(unittest.TestCase):
    def test_executor_loads_its_explicit_contract_inside_existing_budgets(self):
        root = Path(__file__).resolve().parents[1]
        files = {'infra/staging/' + path.name: base.digest(path)
                 for path in (root / 'infra/staging').glob('deploy_*.py')}
        code = deploy.executor_code({'files': files, 'message_sync': True})
        safe = code.rsplit('print(json.dumps', 1)[0]
        safe += 'assert callable(sys.modules["deploy_message_sync"].activate)\n'
        safe += 'assert "deploy_worker_boot" not in sys.modules\n'
        subprocess.run([sys.executable, '-c', safe], check=True, capture_output=True, timeout=10)
        self.assertLess(len(code.encode()), 64 * 1024)
        ordinary = deploy.executor_code({'files': files})
        self.assertNotIn('deploy_message_sync', ordinary.rsplit('print(json.dumps', 1)[0])

    def test_review_pins_both_complete_sources_and_rejects_schema_or_unit_drift(self):
        sql = sync.previous.directory.ranking.capacity
        with (patch.object(base, 'reviewed_database') as reviewed,
              patch.object(base, 'verify_community_tables'),
              patch.object(base, 'digest', return_value='same'),
              patch.object(sql, 'psql', return_value=b't')):
            sync.review(Path('candidate'), Path('live'))
        self.assertEqual(reviewed.call_args.args[2], {'before': sync.BEFORE,
            'reviewed': sync.REVIEWED, 'versions': 96, 'previous_versions': 95})
        for digests, schema in [(['changed', 'old'], b't'), (['same'] * 8, b'f')]:
            with (patch.object(base, 'reviewed_database'),
                  patch.object(base, 'verify_community_tables'),
                  patch.object(base, 'digest', side_effect=digests),
                  patch.object(sql, 'psql', return_value=schema), self.assertRaises(RuntimeError)):
                sync.review(Path('candidate'), Path('live'))

    def test_changed_preserved_rows_history_or_capacity_refuses_publication(self):
        before = {'versions': list(range(1, 96)), 'tables': {'ciphertext': 'same', 'quota': 'same'}}
        after = {'versions': list(range(1, 97)), 'tables': before['tables']}
        for value in [dict(after, tables={}), dict(after, versions=[])]:
            with (patch.object(sync, 'snapshot', return_value=value),
                  patch.object(base, 'attachment_versions', return_value=after['versions']),
                  self.assertRaises(RuntimeError)):
                sync.verify_migration(Path('candidate'), before)
        for check in [b't', b'f']:
            with (patch.object(sync, 'snapshot', return_value=after),
                  patch.object(base, 'attachment_versions', return_value=after['versions']),
                  patch.object(base, 'verify_community_tables'),
                  patch.object(sync.previous.directory.ranking.capacity, 'psql', return_value=check)):
                if check == b't': sync.verify_migration(Path('candidate'), before)
                else:
                    with self.assertRaisesRegex(RuntimeError, 'reconciliation'):
                        sync.verify_migration(Path('candidate'), before)

    def test_snapshot_omits_only_verified_additions_and_keeps_journal_pagination(self):
        batches = sync.previous.directory.ranking.batches
        with (patch.object(sync.backups, 'database_snapshot', return_value={'tables': {}}) as small,
              patch.object(batches, 'snapshot', return_value={'message_changes': 'digest'}) as paged):
            sync.snapshot()
        self.assertNotIn('message_changes', small.call_args.args[0])
        self.assertEqual(small.call_args.kwargs, {'omit_columns': sync.OMIT_COLUMNS,
            'version_limit': 96, 'include_reserved': True})
        self.assertEqual(paged.call_args.kwargs, {'omit_columns': sync.JOURNAL_COLUMNS})

    def test_explicit_flag_reuses_verified_backup_and_phase_aware_worker_recovery(self):
        for config in [{}, {'message_sync': False}, {'message_sync': 1}]:
            with (patch.object(base, 'activate_database') as activate,
                  self.assertRaisesRegex(RuntimeError, 'explicit --message-sync approval')):
                sync.activate(config, Path('work'), Path('candidate'), {})
            activate.assert_not_called()
        with (patch.object(sync.background, 'verify_current'),
              patch.object(sync.previous.directory.ranking.parts, 'require_workers'),
              patch.object(base, 'receipt'),
              patch.object(base, 'activate_database', return_value={'status': 'published'}) as activate):
            result = sync.activate({'message_sync': True}, Path('work'), Path('candidate'), {})
        contract = activate.call_args.args[3]
        self.assertEqual(contract['versions'], 95)
        self.assertIs(contract['snapshot'], sync.snapshot)
        self.assertIs(contract['verify'], sync.verify_migration)
        self.assertIs(contract['stop_existing'], sync.background.stop)
        self.assertIs(contract['resume_existing'], sync.background.start)
        self.assertEqual(result['message_sync_schema_versions'], 96)

    def test_cli_refuses_other_operational_transitions(self):
        for other in ['--prepare', '--post-search', '--contact-invitations', '--profile-directory',
                      '--capacity', '--request-limit', '--media-worker', '--worker-boot']:
            args = ['deploy.py', '--message-sync', other]
            if other != '--prepare': args.append('--check')
            with (patch.object(sys, 'argv', args), patch.object(deploy, 'shared_private_workspace'),
                  patch.object(deploy, 'repository') as repository,
                  contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit)):
                deploy.main()
            repository.assert_not_called()

    def test_check_transports_approval_without_activating(self):
        with (patch.object(sys, 'argv', ['deploy.py', '--check', '--message-sync']),
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
        self.assertIs(remote.call_args.args[1]['message_sync'], True)
