"""Owner-approved index transition uses the existing bounded release executor."""
from pathlib import Path
import subprocess
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'infra/staging'))
import deploy
import deploy_post_search as search
import deploy_remote as base


class PostSearchDeploymentTests(unittest.TestCase):
    def test_internal_verifier_loads_inside_existing_transport_budget(self):
        root = Path(__file__).resolve().parents[1]
        files = {'infra/staging/' + path.name: base.digest(path)
                 for path in (root / 'infra/staging').glob('deploy_*.py')}
        code = deploy.executor_code({'files': files, 'post_search': True})
        safe = code.rsplit('print(json.dumps', 1)[0]
        safe += 'assert callable(sys.modules["deploy_post_search"].activate)\n'
        safe += 'assert "deploy_worker_boot" not in sys.modules\n'
        subprocess.run([sys.executable, '-c', safe], check=True, capture_output=True, timeout=10)
        self.assertLess(len(code.encode()), 64 * 1024)

    def test_review_pins_complete_sources_and_refuses_unit_or_schema_drift(self):
        with (patch.object(base, 'reviewed_database') as reviewed,
              patch.object(base, 'verify_community_tables'),
              patch.object(base, 'digest', return_value='same'),
              patch.object(search.directory.ranking.capacity, 'psql', return_value=b't')):
            search.review(Path('candidate'), Path('live'))
        self.assertRegex(search.REVIEWED, r'^[a-f0-9]{40}$')
        self.assertEqual(reviewed.call_args.args[2], {'before': search.BEFORE,
            'reviewed': search.REVIEWED, 'versions': 95, 'previous_versions': 94})
        with (patch.object(base, 'reviewed_database'),
              patch.object(base, 'verify_community_tables'),
              patch.object(base, 'digest', side_effect=['changed', 'old']),
              self.assertRaisesRegex(RuntimeError, 'unit changes')):
            search.review(Path('candidate'), Path('live'))

    def test_index_migration_preserves_rows_accounting_and_history(self):
        before = {'versions': list(range(1, 95)), 'tables': {'public': 'same', 'private': 'same'}}
        after = {'versions': list(range(1, 96)), 'tables': before['tables']}
        for value in [dict(after, tables={}), dict(after, versions=[])]:
            with (patch.object(search, 'snapshot', return_value=value),
                  patch.object(base, 'attachment_versions', return_value=after['versions']),
                  self.assertRaises(RuntimeError)):
                search.verify_migration(Path('candidate'), before)
        with (patch.object(search, 'snapshot', return_value=after),
              patch.object(base, 'attachment_versions', return_value=after['versions']),
              patch.object(base, 'verify_community_tables'),
              patch.object(search.directory.ranking.capacity, 'psql', return_value=b't')):
            search.verify_migration(Path('candidate'), before)

    def test_activation_requires_explicit_flag_and_reuses_backup_and_worker_lifecycle(self):
        with (patch.object(base, 'activate_database') as activate,
              self.assertRaisesRegex(RuntimeError, 'explicit --post-search approval')):
            search.activate({}, Path('work'), Path('candidate'), {})
        activate.assert_not_called()
        with (patch.object(search.background, 'verify_current'),
              patch.object(search.directory.ranking.parts, 'require_workers'),
              patch.object(base, 'receipt'),
              patch.object(base, 'activate_database', return_value={'status': 'published'}) as activate):
            result = search.activate({'post_search': True}, Path('work'), Path('candidate'), {})
        contract = activate.call_args.args[3]
        self.assertEqual(contract['versions'], 94)
        self.assertIs(contract['snapshot'], search.snapshot)
        self.assertIs(contract['verify'], search.verify_migration)
        self.assertIs(contract['stop_existing'], search.background.stop)
        self.assertEqual(result['post_search_schema_versions'], 95)
