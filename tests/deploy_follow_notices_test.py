"""Follower notices use one exact, backed-up 103→104 release transition."""
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
import deploy_follow_notices as notices
import deploy_remote as base

ROOT = Path(__file__).resolve().parents[1]


class FollowNoticeDeploymentTests(unittest.TestCase):
    def test_executor_loads_its_explicit_contract_inside_existing_budgets(self):
        files = {'infra/staging/' + path.name: base.digest(path)
                 for path in (ROOT / 'infra/staging').glob('deploy_*.py')}
        code = deploy.executor_code({'files': files, 'follow_notices': True})
        safe = code.rsplit('print(json.dumps', 1)[0]
        safe += 'assert callable(sys.modules["deploy_follow_notices"].activate)\n'
        safe += 'assert "deploy_worker_boot" not in sys.modules\n'
        subprocess.run([sys.executable, '-c', safe], check=True, capture_output=True, timeout=10)
        self.assertLess(len(code.encode()), 64 * 1024)
        ordinary = deploy.executor_code({'files': files})
        self.assertNotIn('deploy_follow_notices', ordinary.rsplit('print(json.dumps', 1)[0])

    def test_schema_104_routes_review_and_activation_here(self):
        self.assertEqual(base.TRANSITIONS[104], 'deploy_follow_notices')
        self.assertEqual(base.TRANSITIONS[103], 'deploy_account_engagement')
        with (patch.object(Path, 'glob', return_value=[Path('m')] * 104),
              patch.object(notices, 'review') as review):
            base.database_review(Path('candidate'), Path('live'))
        review.assert_called_once_with(Path('candidate'), Path('live'))

    def test_migration_104_is_the_reviewed_table_only(self):
        sql = (ROOT / 'src/server/database/migrations/104-profile-follow-notices.sql').read_text()
        self.assertIn('CREATE TABLE hash_talk.public_follow_notifications', sql)
        self.assertNotIn('INSERT INTO', sql.upper())
        self.assertEqual(notices.TABLE, 'public_follow_notifications')
        self.assertNotIn(notices.TABLE, notices.TABLES)
        self.assertIn('engagement_counts', notices.TABLES)

    def test_accounting_contract_counts_the_new_source(self):
        import deploy_account_engagement as previous
        self.assertEqual(notices.METRIC_TABLES, previous.METRIC_TABLES)
        self.assertEqual(notices.TABLES, previous.TABLES)
        self.assertEqual(notices.PREVIOUS_COUNTER, previous.COUNTER_CHECKS)
        self.assertEqual(notices.PREVIOUS_GLOBAL, previous.GLOBAL_CHECK)
        self.assertIn('tgrelid)=97', notices.COUNTER_CHECKS)
        self.assertNotIn('tgrelid)=96', notices.COUNTER_CHECKS)
        self.assertIn('sources<>97', notices.GLOBAL_CHECK)
        self.assertNotIn('sources<>96', notices.GLOBAL_CHECK)
        self.assertIn('NOT EXISTS(SELECT 1 FROM hash_talk.public_follow_notifications)', notices.SCHEMA_CHECK)

    def test_review_pins_both_sources_and_rejects_schema_accounting_or_unit_drift(self):
        sql = notices.search.directory.ranking.capacity
        with (patch.object(base, 'reviewed_database') as reviewed,
              patch.object(base, 'verify_community_tables') as tables,
              patch.object(base, 'digest', return_value='same'),
              patch.object(sql, 'psql', side_effect=[b't', b't', b't'])):
            notices.review(Path('candidate'), Path('live'))
        self.assertEqual(reviewed.call_args.args[2], {'before': notices.BEFORE,
            'reviewed': notices.REVIEWED, 'versions': 104, 'previous_versions': 103})
        self.assertNotIn(notices.TABLE, tables.call_args.args[0])
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
        before = {'versions': list(range(1, 104)), 'tables': {'engagement_counts': 'same', 'quota': 'same'}}
        after = {'versions': list(range(1, 105)), 'tables': before['tables']}
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
                    self.assertIn(notices.TABLE, tables.call_args.args[0])
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
        self.assertEqual(small.call_args.kwargs, {'version_limit': 104, 'include_reserved': True})

    def test_explicit_flag_reuses_verified_backup_and_worker_recovery(self):
        for config in [{}, {'follow_notices': False}, {'follow_notices': 1}, {'account_engagement': True}]:
            with (patch.object(base, 'activate_database') as activate,
                  self.assertRaisesRegex(RuntimeError, 'explicit --follow-notices approval')):
                notices.activate(config, Path('work'), Path('candidate'), {})
            activate.assert_not_called()
        with (patch.object(notices.background, 'verify_current'),
              patch.object(notices.search.directory.ranking.parts, 'require_workers'),
              patch.object(base, 'receipt'),
              patch.object(base, 'activate_database', return_value={'status': 'published'}) as activate):
            result = notices.activate({'follow_notices': True}, Path('work'), Path('candidate'), {})
        contract = activate.call_args.args[3]
        self.assertEqual(contract['versions'], 103)
        self.assertIs(contract['snapshot'], notices.snapshot)
        self.assertIs(contract['verify'], notices.verify_migration)
        self.assertIs(contract['stop_existing'], notices.background.stop)
        self.assertEqual(result['follow_notice_schema_versions'], 104)

    def test_cli_refuses_other_operational_transitions(self):
        for other in ['--prepare', '--account-engagement', '--engagement', '--share-counts',
                      '--capacity', '--request-limit', '--media-worker', '--worker-boot']:
            args = ['deploy.py', '--follow-notices', other]
            if other != '--prepare': args.append('--check')
            with (patch.object(sys, 'argv', args), patch.object(deploy, 'shared_private_workspace'),
                  patch.object(deploy, 'repository') as repository,
                  contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit)):
                deploy.main()
            repository.assert_not_called()

    def test_explicit_target_accepts_this_transition(self):
        with (patch.dict(os.environ, {'OXDMME_DEPLOY_TARGET_PROFILE': 'destination'}),
              patch.object(sys, 'argv', ['deploy.py', '--check', '--follow-notices']),
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
        self.assertIs(remote.call_args.args[1]['follow_notices'], True)


if __name__ == '__main__':
    unittest.main()
