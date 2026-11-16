"""The notification release verifies its exact schema and preserves the prior rows."""
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'infra/staging'))
import deploy
import deploy_notification_cursors as cursors
import deploy_remote as base


MODE = {'notification_cursors': True}


class NotificationCursorDeploymentTests(unittest.TestCase):
    def test_executor_loads_the_review_only_for_the_explicit_transition(self):
        files = {'infra/staging/' + p.name: base.digest(p)
                 for p in (ROOT / 'infra/staging').glob('deploy_*.py')}
        code = deploy.executor_code({'files': files, **MODE})
        source = code.rsplit('print(json.dumps', 1)[0]
        source += 'assert callable(sys.modules["deploy_notification_cursors"].activate)\n'
        source += 'assert "deploy_database_code_review" not in sys.modules\n'
        subprocess.run([sys.executable, '-c', source], check=True, capture_output=True, timeout=10)
        self.assertLess(len(code.encode()), 64 * 1024)
        self.assertFalse(base.schema_transition_requested({}))
        self.assertTrue(base.schema_transition_requested(MODE))
        self.assertEqual(base.TRANSITIONS[111], 'deploy_notification_cursors')

    def test_activation_dispatch_does_not_depend_on_code_only_catalog(self):
        with tempfile.TemporaryDirectory() as path:
            work = Path(path)
            candidate = work / 'candidate'
            migrations = candidate / 'src/server/database/migrations'
            migrations.mkdir(parents=True)
            for version in range(1, 112):
                (migrations / f'{version:03d}.sql').touch()
            with (patch.object(base, 'preflight', return_value={'running': True}),
                  patch.object(base, 'digest', return_value='archive'),
                  patch.object(base, 'receipt'),
                  patch.object(base, 'prepare', return_value=candidate),
                  patch.object(base, 'preservation'),
                  patch.object(base, 'own_state', return_value={'running': True}),
                  patch.object(base, 'database_files', side_effect=[{'new'}, {'old'}]),
                  patch.object(base, 'database_code_reviewed', side_effect=ModuleNotFoundError),
                  patch.object(cursors, 'activate', return_value={'status': 'published'}) as dispatch):
                config = dict(MODE, archive_sha256='archive', commit='candidate', baseline={})
                self.assertEqual(base.activate(config, work), {'status': 'published'})
                dispatch.assert_called_once_with(config, work, candidate, {'running': True})

    def test_the_two_new_columns_are_the_only_control_fields_omitted_from_the_snapshot(self):
        previous = cursors.previous
        batches = previous.search.directory.ranking.batches
        with (patch.object(previous.backups, 'database_snapshot', return_value={'tables': {}}) as snapshot,
              patch.object(batches, 'snapshot', return_value={'message_changes': 'digest'})):
            result = cursors.snapshot()
        self.assertIn('group_controls', snapshot.call_args.args[0])
        self.assertEqual(snapshot.call_args.kwargs, {
            'omit_columns': {'conversation_controls': ('notifications_through',),
                             'group_controls': ('notifications_through',)},
            'version_limit': 111,
            'include_reserved': True,
        })
        self.assertEqual(result['tables'], {'message_changes': 'digest'})

    def test_schema_validation_rejects_existing_row_drift_or_nonzero_cursors(self):
        checksums = list(range(1, 112))
        before = {'versions': checksums[:110], 'tables': {'group_controls': 'original'}}
        after = {'versions': checksums, 'tables': before['tables']}
        sql = cursors.previous.search.directory.ranking.capacity
        for snapshot, schema_ok in [(dict(after, tables={}), b't'), (after, b'f')]:
            with (patch.object(cursors, 'snapshot', return_value=snapshot),
                  patch.object(base, 'attachment_versions', return_value=checksums),
                  patch.object(base, 'verify_community_tables'),
                  patch.object(sql, 'psql', return_value=schema_ok),
                  self.assertRaises(RuntimeError)):
                cursors.verify_migration(Path('candidate'), before)

    def test_transition_requires_its_own_approval_flag_before_touching_workers(self):
        with (patch.object(cursors.previous.background, 'verify_current') as workers,
              self.assertRaisesRegex(RuntimeError, 'explicit --notification-cursors approval')):
            cursors.activate({'group_pins': True}, Path('work'), Path('candidate'), {})
        workers.assert_not_called()


if __name__ == '__main__':
    unittest.main()
