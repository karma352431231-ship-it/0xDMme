"""The account fact at commit uses one exact, backed-up 102→103 release transition."""
import contextlib
import io
import os
from pathlib import Path
import subprocess
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'infra/staging'))
import deploy
import deploy_account_engagement as fact
import deploy_remote as base


class AccountEngagementDeploymentTests(unittest.TestCase):
    def test_executor_loads_its_explicit_contract_inside_existing_budgets(self):
        root = Path(__file__).resolve().parents[1]
        files = {'infra/staging/' + path.name: base.digest(path)
                 for path in (root / 'infra/staging').glob('deploy_*.py')}
        code = deploy.executor_code({'files': files, 'account_engagement': True})
        safe = code.rsplit('print(json.dumps', 1)[0]
        safe += 'assert callable(sys.modules["deploy_account_engagement"].activate)\n'
        safe += 'assert "deploy_worker_boot" not in sys.modules\n'
        subprocess.run([sys.executable, '-c', safe], check=True, capture_output=True, timeout=10)
        self.assertLess(len(code.encode()), 64 * 1024)
        ordinary = deploy.executor_code({'files': files})
        self.assertNotIn('deploy_account_engagement', ordinary.rsplit('print(json.dumps', 1)[0])

    def test_review_pins_both_sources_and_rejects_schema_accounting_or_unit_drift(self):
        sql = fact.previous.directory.ranking.capacity
        with (patch.object(base, 'reviewed_database') as reviewed,
              patch.object(base, 'verify_community_tables') as tables,
              patch.object(base, 'digest', return_value='same'),
              patch.object(sql, 'psql', side_effect=[b't', b'f', b't', b't'])):
            fact.review(Path('candidate'), Path('live'))
        self.assertEqual(reviewed.call_args.args[2], {'before': fact.BEFORE,
            'reviewed': fact.REVIEWED, 'versions': 103, 'previous_versions': 102})
        self.assertIn('engagement_counts', tables.call_args.args[0])
        # Immediate trigger, unguarded function, then both accounting checks.
        for digests, schema in [(['changed', 'old'], [b't', b'f']), (['same'] * 8, [b'f', b'f']),
                                (['same'] * 8, [b't', b't']), (['same'] * 8, [b't', b'f', b'f'])]:
            with (patch.object(base, 'reviewed_database'),
                  patch.object(base, 'verify_community_tables'),
                  patch.object(base, 'digest', side_effect=digests),
                  patch.object(sql, 'psql', side_effect=schema + [b't'] * 3),
                  self.assertRaises(RuntimeError)):
                fact.review(Path('candidate'), Path('live'))

    def test_contract_matches_schema_102_metric_tables_and_accounting(self):
        import deploy_engagement as metrics
        self.assertEqual(fact.METRIC_TABLES, metrics.NEW_TABLES)
        self.assertEqual(fact.COUNTER_CHECKS, metrics.COUNTER_CHECKS)
        self.assertEqual(fact.GLOBAL_CHECK, metrics.GLOBAL_CHECK)

    def test_trigger_checks_pin_the_immediate_and_deferred_definitions(self):
        self.assertIn('NOT tgdeferrable', fact.IMMEDIATE)
        self.assertIn('CREATE TRIGGER engagement_account_fact', fact.IMMEDIATE)
        self.assertIn('tginitdeferred', fact.SCHEMA_CHECK)
        self.assertIn('DEFERRABLE INITIALLY DEFERRED', fact.SCHEMA_CHECK)
        self.assertIn('guard_content_usage()', fact.GUARDED)

    def test_changed_preserved_rows_history_or_schema_refuses_publication(self):
        before = {'versions': list(range(1, 103)), 'tables': {'engagement_counts': 'same', 'quota': 'same'}}
        after = {'versions': list(range(1, 104)), 'tables': before['tables']}
        for value in [dict(after, tables={}), dict(after, versions=[])]:
            with (patch.object(fact, 'snapshot', return_value=value),
                  patch.object(base, 'attachment_versions', return_value=after['versions']),
                  self.assertRaises(RuntimeError)):
                fact.verify_migration(Path('candidate'), before)
        sql = fact.previous.directory.ranking.capacity
        for check in [b't', b'f']:
            with (patch.object(fact, 'snapshot', return_value=after),
                  patch.object(base, 'attachment_versions', return_value=after['versions']),
                  patch.object(base, 'verify_community_tables'),
                  patch.object(sql, 'psql', return_value=check)):
                if check == b't': fact.verify_migration(Path('candidate'), before)
                else:
                    with self.assertRaisesRegex(RuntimeError, 'reconciliation'):
                        fact.verify_migration(Path('candidate'), before)

    def test_snapshot_compares_every_preserved_table_including_metric_storage(self):
        batches = fact.previous.directory.ranking.batches
        with (patch.object(fact.backups, 'database_snapshot', return_value={'tables': {}}) as small,
              patch.object(batches, 'snapshot', return_value={'message_changes': 'digest'})):
            fact.snapshot()
        self.assertIn('engagement_counts', small.call_args.args[0])
        self.assertIn('content_usage_legacy', small.call_args.args[0])
        self.assertNotIn('message_changes', small.call_args.args[0])
        self.assertEqual(small.call_args.kwargs, {'version_limit': 103, 'include_reserved': True})

    def test_explicit_flag_reuses_verified_backup_and_worker_recovery(self):
        for config in [{}, {'account_engagement': False}, {'account_engagement': 1}, {'engagement': True}]:
            with (patch.object(base, 'activate_database') as activate,
                  self.assertRaisesRegex(RuntimeError, 'explicit --account-engagement approval')):
                fact.activate(config, Path('work'), Path('candidate'), {})
            activate.assert_not_called()
        with (patch.object(fact.background, 'verify_current'),
              patch.object(fact.previous.directory.ranking.parts, 'require_workers'),
              patch.object(base, 'receipt'),
              patch.object(base, 'activate_database', return_value={'status': 'published'}) as activate):
            result = fact.activate({'account_engagement': True}, Path('work'), Path('candidate'), {})
        contract = activate.call_args.args[3]
        self.assertEqual(contract['versions'], 102)
        self.assertIs(contract['snapshot'], fact.snapshot)
        self.assertIs(contract['verify'], fact.verify_migration)
        self.assertIs(contract['stop_existing'], fact.background.stop)
        self.assertEqual(result['account_engagement_schema_versions'], 103)

    def test_cli_refuses_other_operational_transitions(self):
        for other in ['--prepare', '--engagement', '--share-counts', '--group-fences', '--profile-directory',
                      '--capacity', '--request-limit', '--media-worker', '--worker-boot']:
            args = ['deploy.py', '--account-engagement', other]
            if other != '--prepare': args.append('--check')
            with (patch.object(sys, 'argv', args), patch.object(deploy, 'shared_private_workspace'),
                  patch.object(deploy, 'repository') as repository,
                  contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit)):
                deploy.main()
            repository.assert_not_called()

    def test_explicit_target_accepts_only_this_transition(self):
        with (patch.dict(os.environ, {'OXDMME_DEPLOY_TARGET_PROFILE': 'destination'}),
              patch.object(sys, 'argv', ['deploy.py', '--check', '--engagement']),
              patch.object(deploy, 'shared_private_workspace'),
              patch.object(deploy.deployment_target, 'profile_directory', return_value=Path('profile')),
              patch.object(deploy, 'repository') as repository,
              contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit)):
            deploy.main()
        repository.assert_not_called()
        with (patch.dict(os.environ, {'OXDMME_DEPLOY_TARGET_PROFILE': 'destination'}),
              patch.object(sys, 'argv', ['deploy.py', '--check', '--account-engagement']),
              patch.object(deploy, 'shared_private_workspace'),
              patch.object(deploy.deployment_target, 'profile_directory', return_value=Path('profile')),
              patch.object(deploy, 'repository', return_value=('a' * 40, 'main')),
              patch.object(deploy, 'ci', return_value='synthetic-ci'),
              patch.object(deploy, 'prepare', return_value=({'commit': 'a' * 40}, Path('archive'))),
              patch.object(deploy, 'private_inputs', return_value=('synthetic-target', {})),
              patch.object(deploy, 'run'), patch.object(deploy, 'remote', return_value={}) as remote,
              patch('builtins.print')):
            deploy.main()
        self.assertEqual(remote.call_args.args[0], 'check')
        self.assertIs(remote.call_args.args[1]['account_engagement'], True)


if __name__ == '__main__':
    unittest.main()
