"""Group pins activation keeps exact-source, backup and preservation boundaries."""
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
import deploy_group_pins as pins

ROOT = Path(__file__).resolve().parents[1]
OLDER = pins.older
SQL = OLDER.search.directory.ranking.capacity


class GroupPinsDeploymentTests(unittest.TestCase):
    def test_only_explicit_transition_loads_and_stays_within_transport_budget(self):
        files = {'infra/staging/' + p.name: base.digest(p)
                 for p in (ROOT / 'infra/staging').glob('deploy_*.py')}
        code = deploy.executor_code({'files': files, 'group_pins': True})
        safe = code.rsplit('print(json.dumps', 1)[0]
        safe += 'assert callable(sys.modules["deploy_group_pins"].activate)\n'
        safe += 'assert "deploy_view_once" not in sys.modules\n'
        safe += 'assert "deploy_group_chat" not in sys.modules\n'
        subprocess.run([sys.executable, '-c', safe], check=True, capture_output=True, timeout=10)
        self.assertLess(len(code.encode()), 64 * 1024)
        self.assertNotIn('deploy_group_pins', deploy.executor_code({'files': files}).rsplit('print(json.dumps', 1)[0])
        self.assertEqual(base.TRANSITIONS[110], 'deploy_group_pins')

    def test_review_pins_sources_and_refuses_units_or_prior_schema_drift(self):
        with (patch.object(base, 'reviewed_database') as reviewed,
              patch.object(base, 'verify_community_tables'),
              patch.object(base, 'digest', return_value='same'),
              patch.object(SQL, 'psql', return_value=b't')):
            pins.review(Path('candidate'), Path('live'))
        self.assertEqual(reviewed.call_args.args[2], {'before': pins.BEFORE,
            'reviewed': pins.REVIEWED, 'versions': 110, 'previous_versions': 109})
        for digests, check in [(['changed', 'old'], b't'), (['same'] * 8, b'f')]:
            with (patch.object(base, 'reviewed_database'),
                  patch.object(base, 'verify_community_tables'),
                  patch.object(base, 'digest', side_effect=digests),
                  patch.object(SQL, 'psql', return_value=check), self.assertRaises(RuntimeError)):
                pins.review(Path('candidate'), Path('live'))

    def test_snapshot_covers_every_group_table_with_version_limit_110(self):
        batches = OLDER.search.directory.ranking.batches
        with (patch.object(OLDER.backups, 'database_snapshot', return_value={'tables': {}}) as small,
              patch.object(batches, 'snapshot', return_value={'message_changes': 'digest'})):
            result = pins.snapshot()
        self.assertIn('group_view_once_payloads', small.call_args.args[0])
        self.assertEqual(small.call_args.kwargs, {'version_limit': 110, 'include_reserved': True})
        self.assertEqual(result['tables']['message_changes'], 'digest')

    def test_any_row_or_checksum_drift_refuses_opening(self):
        before = {'versions': list(range(1, 110)), 'tables': {'group_packets': 'same'}}
        after = {'versions': list(range(1, 111)), 'tables': before['tables']}
        for value in [dict(after, tables={}), dict(after, versions=[])]:
            with (patch.object(pins, 'snapshot', return_value=value),
                  patch.object(base, 'attachment_versions', return_value=after['versions']),
                  self.assertRaises(RuntimeError)):
                pins.verify_migration(Path('candidate'), before)
        for check in [b't', b'f']:
            with (patch.object(pins, 'snapshot', return_value=after),
                  patch.object(base, 'attachment_versions', return_value=after['versions']),
                  patch.object(base, 'verify_community_tables'),
                  patch.object(SQL, 'psql', return_value=check)):
                if check == b't':
                    pins.verify_migration(Path('candidate'), before)
                else:
                    with self.assertRaisesRegex(RuntimeError, 'reconciliation'):
                        pins.verify_migration(Path('candidate'), before)

    def test_explicit_flag_is_required_and_resumes_existing_workers(self):
        for config in [{}, {'group_pins': False}, {'group_chat': True}]:
            with (patch.object(base, 'activate_database') as activate,
                  self.assertRaisesRegex(RuntimeError, 'explicit --group-pins approval')):
                pins.activate(config, Path('work'), Path('candidate'), {})
            activate.assert_not_called()
        with (patch.object(OLDER.background, 'verify_current'),
              patch.object(OLDER.search.directory.ranking.parts, 'require_workers'),
              patch.object(base, 'receipt'),
              patch.object(base, 'activate_database', return_value={'status': 'published'}) as activate):
            result = pins.activate({'group_pins': True}, Path('work'), Path('candidate'), {})
        contract = activate.call_args.args[3]
        self.assertEqual(contract['versions'], 109)
        self.assertIs(contract['verify'], pins.verify_migration)
        self.assertIs(contract['stop_existing'], OLDER.background.stop)
        self.assertEqual(result['group_pins_schema_versions'], 110)

    def test_cli_rejects_combined_transitions(self):
        for other in ['--prepare', '--group-chat', '--view-once', '--capacity']:
            args = ['deploy.py', '--group-pins', other]
            if other != '--prepare': args.append('--check')
            with (patch.object(sys, 'argv', args), patch.object(deploy, 'shared_private_workspace'),
                  patch.object(deploy, 'repository') as repository,
                  contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit)):
                deploy.main()
            repository.assert_not_called()


if __name__ == '__main__':
    unittest.main()
