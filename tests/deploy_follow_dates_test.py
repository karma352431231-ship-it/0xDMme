"""Dated follows use one exact, backed-up 104→105 release transition."""
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
import deploy_follow_dates as notices
import deploy_remote as base

ROOT = Path(__file__).resolve().parents[1]


class FollowDateDeploymentTests(unittest.TestCase):
    def test_executor_loads_its_explicit_contract_inside_existing_budgets(self):
        files = {'infra/staging/' + path.name: base.digest(path)
                 for path in (ROOT / 'infra/staging').glob('deploy_*.py')}
        code = deploy.executor_code({'files': files, 'follow_dates': True})
        safe = code.rsplit('print(json.dumps', 1)[0]
        safe += 'assert callable(sys.modules["deploy_follow_dates"].activate)\n'
        safe += 'assert "deploy_worker_boot" not in sys.modules\n'
        subprocess.run([sys.executable, '-c', safe], check=True, capture_output=True, timeout=10)
        self.assertLess(len(code.encode()), 64 * 1024)
        ordinary = deploy.executor_code({'files': files})
        self.assertNotIn('deploy_follow_dates', ordinary.rsplit('print(json.dumps', 1)[0])

    def test_schema_105_routes_review_and_activation_here(self):
        self.assertEqual(base.TRANSITIONS[105], 'deploy_follow_dates')
        self.assertEqual(base.TRANSITIONS[104], 'deploy_follow_notices')
        with (patch.object(Path, 'glob', return_value=[Path('m')] * 105),
              patch.object(notices, 'review') as review):
            base.database_review(Path('candidate'), Path('live'))
        review.assert_called_once_with(Path('candidate'), Path('live'))

    def test_migration_105_adds_dates_without_backfill(self):
        sql = (ROOT / 'src/server/database/migrations/105-dated-profile-follows.sql').read_text()
        self.assertIn('ADD COLUMN followed_at timestamptz(3)', sql)
        self.assertNotIn('UPDATE HASH_TALK.PUBLIC_PROFILE_FOLLOWS', sql.upper())
        self.assertNotIn('INSERT INTO HASH_TALK.PUBLIC_PROFILE_FOLLOWS', sql.upper())
        self.assertEqual(notices.OMIT_COLUMNS['public_profile_follows'], ('followed_at',))
        self.assertIn('public_follow_notifications', notices.TABLES)

    def test_contract_keeps_schema_104_tables_and_accounting(self):
        import deploy_follow_notices as previous
        self.assertEqual(notices.TABLES, previous.TABLES + (previous.TABLE,))
        self.assertEqual(notices.COUNTER_CHECKS, previous.COUNTER_CHECKS)
        self.assertEqual(notices.GLOBAL_CHECK, previous.GLOBAL_CHECK)
        self.assertIn('NOT EXISTS(SELECT 1 FROM hash_talk.public_profile_follows WHERE followed_at IS NOT NULL)',
                      notices.SCHEMA_CHECK)

    def test_review_pins_both_sources_and_rejects_schema_accounting_or_unit_drift(self):
        sql = notices.search.directory.ranking.capacity
        with (patch.object(base, 'reviewed_database') as reviewed,
              patch.object(base, 'verify_community_tables') as tables,
              patch.object(base, 'digest', return_value='same'),
              patch.object(sql, 'psql', side_effect=[b't', b't', b't'])):
            notices.review(Path('candidate'), Path('live'))
        self.assertEqual(reviewed.call_args.args[2], {'before': notices.BEFORE,
            'reviewed': notices.REVIEWED, 'versions': 105, 'previous_versions': 104})
        self.assertIn('public_follow_notifications', tables.call_args.args[0])
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
        before = {'versions': list(range(1, 105)), 'tables': {'engagement_counts': 'same', 'quota': 'same'}}
        after = {'versions': list(range(1, 106)), 'tables': before['tables']}
        for value in [dict(after, tables={}), dict(after, versions=[])]:
            with (patch.object(notices, 'snapshot', return_value=value),
                  patch.object(base, 'attachment_versions', return_value=after['versions']),
                  self.assertRaises(RuntimeError)):
                notices.verify_migration(Path('candidate'), before)
        sql = notices.search.directory.ranking.capacity
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
        batches = notices.search.directory.ranking.batches
        with (patch.object(notices.backups, 'database_snapshot', return_value={'tables': {}}) as small,
              patch.object(batches, 'snapshot', return_value={'message_changes': 'digest'})):
            notices.snapshot()
        self.assertIn('engagement_counts', small.call_args.args[0])
        self.assertIn('content_usage_legacy', small.call_args.args[0])
        self.assertNotIn('message_changes', small.call_args.args[0])
        self.assertEqual(small.call_args.kwargs, {'omit_columns': notices.OMIT_COLUMNS,
                                                  'version_limit': 105, 'include_reserved': True})

    def test_explicit_flag_reuses_verified_backup_and_worker_recovery(self):
        for config in [{}, {'follow_dates': False}, {'follow_dates': 1}, {'follow_notices': True}]:
            with (patch.object(base, 'activate_database') as activate,
                  self.assertRaisesRegex(RuntimeError, 'explicit --follow-dates approval')):
                notices.activate(config, Path('work'), Path('candidate'), {})
            activate.assert_not_called()
        with (patch.object(notices.background, 'verify_current'),
              patch.object(notices.search.directory.ranking.parts, 'require_workers'),
              patch.object(base, 'receipt'),
              patch.object(base, 'activate_database', return_value={'status': 'published'}) as activate):
            result = notices.activate({'follow_dates': True}, Path('work'), Path('candidate'), {})
        contract = activate.call_args.args[3]
        self.assertEqual(contract['versions'], 104)
        self.assertIs(contract['snapshot'], notices.snapshot)
        self.assertIs(contract['verify'], notices.verify_migration)
        self.assertIs(contract['stop_existing'], notices.background.stop)
        self.assertEqual(result['follow_date_schema_versions'], 105)

    def test_cli_refuses_other_operational_transitions(self):
        for other in ['--prepare', '--follow-notices', '--account-engagement', '--engagement', '--share-counts',
                      '--capacity', '--request-limit', '--media-worker', '--worker-boot']:
            args = ['deploy.py', '--follow-dates', other]
            if other != '--prepare': args.append('--check')
            with (patch.object(sys, 'argv', args), patch.object(deploy, 'shared_private_workspace'),
                  patch.object(deploy, 'repository') as repository,
                  contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit)):
                deploy.main()
            repository.assert_not_called()

    def test_explicit_target_accepts_this_transition(self):
        with (patch.dict(os.environ, {'OXDMME_DEPLOY_TARGET_PROFILE': 'destination'}),
              patch.object(sys, 'argv', ['deploy.py', '--check', '--follow-dates']),
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
        self.assertIs(remote.call_args.args[1]['follow_dates'], True)


if __name__ == '__main__':
    unittest.main()
