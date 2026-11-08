"""Visitor retention uses one exact, backed-up 105→106 release transition."""
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
import deploy_follow_dates as previous
import deploy_visitor_retention as notices
import deploy_remote as base

ROOT = Path(__file__).resolve().parents[1]


class VisitorRetentionDeploymentTests(unittest.TestCase):
    def test_executor_loads_its_explicit_contract_inside_existing_budgets(self):
        files = {'infra/staging/' + path.name: base.digest(path)
                 for path in (ROOT / 'infra/staging').glob('deploy_*.py')}
        code = deploy.executor_code({'files': files, 'visitor_retention': True})
        safe = code.rsplit('print(json.dumps', 1)[0]
        safe += 'assert callable(sys.modules["deploy_visitor_retention"].activate)\n'
        safe += 'assert "deploy_worker_boot" not in sys.modules\n'
        subprocess.run([sys.executable, '-c', safe], check=True, capture_output=True, timeout=10)
        self.assertLess(len(code.encode()), 64 * 1024)
        ordinary = deploy.executor_code({'files': files})
        self.assertNotIn('deploy_visitor_retention', ordinary.rsplit('print(json.dumps', 1)[0])

    def test_schema_106_routes_review_and_activation_here(self):
        self.assertEqual(base.TRANSITIONS[106], 'deploy_visitor_retention')
        self.assertEqual(base.TRANSITIONS[105], 'deploy_follow_dates')
        with (patch.object(Path, 'glob', return_value=[Path('m')] * 106),
              patch.object(notices, 'review') as review):
            base.database_review(Path('candidate'), Path('live'))
        review.assert_called_once_with(Path('candidate'), Path('live'))

    def test_migration_106_only_adds_the_retention_function_and_coverage_column(self):
        sql = (ROOT / 'src/server/database/migrations/106-visitor-retention.sql').read_text()
        self.assertIn("SELECT interval '30 days'", sql)
        self.assertIn('ADD COLUMN visitors_complete_from timestamptz(3)', sql)
        self.assertNotIn('CREATE TABLE', sql.upper())
        self.assertNotIn('DELETE FROM', sql.upper())
        self.assertEqual(notices.OMIT_COLUMNS['engagement_state'], ('visitors_complete_from',))

    def test_contract_keeps_schema_105_tables_and_accounting(self):
        self.assertEqual(notices.TABLES, previous.TABLES)
        self.assertEqual(notices.COUNTER_CHECKS, previous.COUNTER_CHECKS)
        self.assertEqual(notices.GLOBAL_CHECK, previous.GLOBAL_CHECK)
        self.assertIn("engagement_technical_retention()=interval '7 days'", notices.SCHEMA_CHECK)

    def test_review_pins_both_sources_and_rejects_schema_accounting_or_unit_drift(self):
        sql = previous.search.directory.ranking.capacity
        with (patch.object(base, 'reviewed_database') as reviewed,
              patch.object(base, 'verify_community_tables') as tables,
              patch.object(base, 'digest', return_value='same'),
              patch.object(sql, 'psql', side_effect=[b't', b't', b't'])):
            notices.review(Path('candidate'), Path('live'))
        self.assertEqual(reviewed.call_args.args[2], {'before': notices.BEFORE,
            'reviewed': notices.REVIEWED, 'versions': 106, 'previous_versions': 105})
        self.assertIn('engagement_visitors', tables.call_args.args[0])
        # Absent table, then both predecessor accounting checks.
        for digests, schema in [(['changed', 'old'], [b't']), (['same'] * 8, [b'f']),
                                (['same'] * 8, [b't', b'f']), (['same'] * 8, [b't', b't', b'f'])]:
            with (patch.object(base, 'reviewed_database'),
                  patch.object(base, 'verify_community_tables'),
                  patch.object(base, 'digest', side_effect=digests),
                  patch.object(sql, 'psql', side_effect=schema + [b't'] * 3),
                  self.assertRaises(RuntimeError)):
                notices.review(Path('candidate'), Path('live'))

    def test_changed_preserved_rows_history_or_schema_refuses_publication(self):
        before = {'versions': list(range(1, 106)), 'tables': {'engagement_counts': 'same', 'quota': 'same'}}
        after = {'versions': list(range(1, 107)), 'tables': before['tables']}
        for value in [dict(after, tables={}), dict(after, versions=[])]:
            with (patch.object(notices, 'snapshot', return_value=value),
                  patch.object(base, 'attachment_versions', return_value=after['versions']),
                  self.assertRaises(RuntimeError)):
                notices.verify_migration(Path('candidate'), before)
        sql = previous.search.directory.ranking.capacity
        for check in [b't', b'f']:
            with (patch.object(notices, 'snapshot', return_value=after),
                  patch.object(base, 'attachment_versions', return_value=after['versions']),
                  patch.object(base, 'verify_community_tables') as tables,
                  patch.object(sql, 'psql', return_value=check)):
                if check == b't':
                    notices.verify_migration(Path('candidate'), before)
                    self.assertEqual(tables.call_args.args[0], notices.TABLES)
                else:
                    with self.assertRaisesRegex(RuntimeError, 'reconciliation'):
                        notices.verify_migration(Path('candidate'), before)

    def test_snapshot_compares_every_preserved_table(self):
        batches = previous.search.directory.ranking.batches
        with (patch.object(previous.backups, 'database_snapshot', return_value={'tables': {}}) as small,
              patch.object(batches, 'snapshot', return_value={'message_changes': 'digest'})):
            notices.snapshot()
        self.assertIn('engagement_counts', small.call_args.args[0])
        self.assertIn('content_usage_legacy', small.call_args.args[0])
        self.assertNotIn('message_changes', small.call_args.args[0])
        self.assertEqual(small.call_args.kwargs, {'omit_columns': notices.OMIT_COLUMNS,
                                                  'version_limit': 106, 'include_reserved': True})

    def test_explicit_flag_reuses_verified_backup_and_worker_recovery(self):
        for config in [{}, {'visitor_retention': False}, {'visitor_retention': 1}, {'follow_dates': True}]:
            with (patch.object(base, 'activate_database') as activate,
                  self.assertRaisesRegex(RuntimeError, 'explicit --visitor-retention approval')):
                notices.activate(config, Path('work'), Path('candidate'), {})
            activate.assert_not_called()
        with (patch.object(previous.background, 'verify_current'),
              patch.object(previous.search.directory.ranking.parts, 'require_workers'),
              patch.object(base, 'receipt'),
              patch.object(base, 'activate_database', return_value={'status': 'published'}) as activate):
            result = notices.activate({'visitor_retention': True}, Path('work'), Path('candidate'), {})
        contract = activate.call_args.args[3]
        self.assertEqual(contract['versions'], 105)
        self.assertIs(contract['snapshot'], notices.snapshot)
        self.assertIs(contract['verify'], notices.verify_migration)
        self.assertIs(contract['stop_existing'], previous.background.stop)
        self.assertEqual(result['visitor_retention_schema_versions'], 106)

    def test_cli_refuses_other_operational_transitions(self):
        for other in ['--prepare', '--follow-dates', '--follow-notices', '--account-engagement', '--engagement', '--share-counts',
                      '--capacity', '--request-limit', '--media-worker', '--worker-boot']:
            args = ['deploy.py', '--visitor-retention', other]
            if other != '--prepare': args.append('--check')
            with (patch.object(sys, 'argv', args), patch.object(deploy, 'shared_private_workspace'),
                  patch.object(deploy, 'repository') as repository,
                  contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit)):
                deploy.main()
            repository.assert_not_called()

    def test_explicit_target_accepts_this_transition(self):
        with (patch.dict(os.environ, {'OXDMME_DEPLOY_TARGET_PROFILE': 'destination'}),
              patch.object(sys, 'argv', ['deploy.py', '--check', '--visitor-retention']),
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
        self.assertIs(remote.call_args.args[1]['visitor_retention'], True)


if __name__ == '__main__':
    unittest.main()
