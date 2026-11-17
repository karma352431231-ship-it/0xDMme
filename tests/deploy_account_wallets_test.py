"""The account wallet release verifies its exact schema and preserves the prior rows."""
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'infra/staging'))
import deploy
import deploy_account_wallets as wallets
import deploy_remote as base


MODE = {'account_wallets': True}


class AccountWalletDeploymentTests(unittest.TestCase):
    def test_executor_loads_the_review_only_for_the_explicit_transition(self):
        files = {'infra/staging/' + p.name: base.digest(p)
                 for p in (ROOT / 'infra/staging').glob('deploy_*.py')}
        code = deploy.executor_code({'files': files, **MODE})
        source = code.rsplit('print(json.dumps', 1)[0]
        source += 'assert callable(sys.modules["deploy_account_wallets"].activate)\n'
        source += 'assert "deploy_database_code_review" not in sys.modules\n'
        source += 'assert "deploy_notification_cursors" not in sys.modules\n'
        subprocess.run([sys.executable, '-c', source], check=True, capture_output=True, timeout=10)
        self.assertLess(len(code.encode()), 64 * 1024)
        self.assertFalse(base.schema_transition_requested({}))
        self.assertTrue(base.schema_transition_requested(MODE))
        self.assertEqual(base.TRANSITIONS[113], 'deploy_account_wallets')
        self.assertNotIn(112, base.TRANSITIONS)

    def test_activation_dispatch_does_not_depend_on_code_only_catalog(self):
        with tempfile.TemporaryDirectory() as path:
            work = Path(path)
            candidate = work / 'candidate'
            migrations = candidate / 'src/server/database/migrations'
            migrations.mkdir(parents=True)
            for version in range(1, 114):
                (migrations / f'{version:03d}.sql').touch()
            with (patch.object(base, 'preflight', return_value={'running': True}),
                  patch.object(base, 'digest', return_value='archive'),
                  patch.object(base, 'receipt'),
                  patch.object(base, 'prepare', return_value=candidate),
                  patch.object(base, 'preservation'),
                  patch.object(base, 'own_state', return_value={'running': True}),
                  patch.object(base, 'database_files', side_effect=[{'new'}, {'old'}]),
                  patch.object(base, 'database_code_reviewed', side_effect=ModuleNotFoundError),
                  patch.object(wallets, 'activate', return_value={'status': 'published'}) as dispatch):
                config = dict(MODE, archive_sha256='archive', commit='candidate', baseline={})
                self.assertEqual(base.activate(config, work), {'status': 'published'})
                dispatch.assert_called_once_with(config, work, candidate, {'running': True})

    def test_the_review_pins_both_migrations_in_one_step_from_the_exact_sources(self):
        sql = wallets.previous.search.directory.ranking.capacity
        with (patch.object(base, 'reviewed_database') as reviewed,
              patch.object(base, 'verify_community_tables'),
              patch.object(base, 'digest', return_value='same'),
              patch.object(sql, 'psql', return_value=b't')):
            wallets.review(Path('candidate'), Path('live'))
        self.assertEqual(reviewed.call_args.args[2], {
            'before': wallets.BEFORE, 'reviewed': wallets.REVIEWED,
            'versions': 113, 'previous_versions': 111})
        for commit in (wallets.BEFORE, wallets.REVIEWED):
            self.assertRegex(commit, r'^[0-9a-f]{40}$')

    def test_review_refuses_a_predecessor_that_already_has_the_new_schema(self):
        sql = wallets.previous.search.directory.ranking.capacity
        with (patch.object(base, 'reviewed_database'),
              patch.object(base, 'verify_community_tables'),
              patch.object(base, 'digest', return_value='same'),
              patch.object(sql, 'psql', return_value=b'f'),
              self.assertRaisesRegex(RuntimeError, 'predecessor schema or accounting differs')):
            wallets.review(Path('candidate'), Path('live'))

    def test_the_two_session_columns_are_the_only_fields_omitted_from_the_snapshot(self):
        previous = wallets.previous
        batches = previous.search.directory.ranking.batches
        with (patch.object(previous.backups, 'database_snapshot', return_value={'tables': {}}) as snapshot,
              patch.object(batches, 'snapshot', return_value={'message_changes': 'digest'})):
            result = wallets.snapshot()
        self.assertIn('login_sessions', snapshot.call_args.args[0])
        self.assertIn('accounts', snapshot.call_args.args[0])
        self.assertNotIn('account_wallets', snapshot.call_args.args[0])
        self.assertEqual(snapshot.call_args.kwargs, {
            'omit_columns': {'login_sessions': ('wallet_ecosystem', 'wallet_address')},
            'version_limit': 113,
            'include_reserved': True,
        })
        self.assertEqual(result['tables'], {'message_changes': 'digest'})

    def test_schema_validation_rejects_existing_row_drift_or_a_wrong_schema(self):
        checksums = list(range(1, 114))
        before = {'versions': checksums[:111], 'tables': {'login_sessions': 'original'}}
        after = {'versions': checksums, 'tables': before['tables']}
        sql = wallets.previous.search.directory.ranking.capacity
        for snapshot, schema_ok in [(dict(after, tables={}), b't'), (after, b'f')]:
            with (patch.object(wallets, 'snapshot', return_value=snapshot),
                  patch.object(base, 'attachment_versions', return_value=checksums),
                  patch.object(base, 'verify_community_tables'),
                  patch.object(sql, 'psql', return_value=schema_ok),
                  self.assertRaises(RuntimeError)):
                wallets.verify_migration(Path('candidate'), before)
        with (patch.object(wallets, 'snapshot', return_value=after),
              patch.object(base, 'attachment_versions', return_value=checksums),
              patch.object(base, 'verify_community_tables'),
              patch.object(sql, 'psql', return_value=b't')):
            wallets.verify_migration(Path('candidate'), before)

    def test_after_migration_the_table_set_includes_exactly_the_new_table(self):
        checksums = list(range(1, 114))
        before = {'versions': checksums[:111], 'tables': {}}
        sql = wallets.previous.search.directory.ranking.capacity
        with (patch.object(wallets, 'snapshot', return_value=dict(before, versions=checksums)),
              patch.object(base, 'attachment_versions', return_value=checksums),
              patch.object(base, 'verify_community_tables') as tables,
              patch.object(sql, 'psql', return_value=b't')):
            wallets.verify_migration(Path('candidate'), before)
        self.assertEqual(tables.call_args.args[0], wallets.TABLES + ('account_wallets',))
        with (patch.object(base, 'reviewed_database'),
              patch.object(base, 'verify_community_tables') as tables,
              patch.object(base, 'digest', return_value='same'),
              patch.object(sql, 'psql', return_value=b't')):
            wallets.review(Path('candidate'), Path('live'))
        self.assertNotIn('account_wallets', tables.call_args.args[0])

    def test_transition_requires_its_own_approval_flag_before_touching_workers(self):
        with (patch.object(wallets.previous.background, 'verify_current') as workers,
              self.assertRaisesRegex(RuntimeError, 'explicit --account-wallets approval')):
            wallets.activate({'notification_cursors': True}, Path('work'), Path('candidate'), {})
        workers.assert_not_called()


if __name__ == '__main__':
    unittest.main()
