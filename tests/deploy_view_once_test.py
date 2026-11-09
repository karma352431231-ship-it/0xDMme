"""Single-delivery activation retains exact-source, backup and preservation gates."""
import subprocess
import sys
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'infra/staging'))
import deploy
import deploy_remote as base
import deploy_view_once as once

ROOT = Path(__file__).resolve().parents[1]


class ViewOnceDeploymentTests(unittest.TestCase):
    def test_executor_loads_only_explicit_transition_within_budget(self):
        files = {'infra/staging/' + p.name: base.digest(p)
                 for p in (ROOT / 'infra/staging').glob('deploy_*.py')}
        code = deploy.executor_code({'files': files, 'view_once': True})
        safe = code.rsplit('print(json.dumps', 1)[0]
        safe += 'assert callable(sys.modules["deploy_view_once"].activate)\n'
        safe += 'assert "deploy_worker_boot" not in sys.modules\n'
        subprocess.run([sys.executable, '-c', safe], check=True, capture_output=True, timeout=10)
        self.assertLess(len(code.encode()), 64 * 1024)
        self.assertNotIn('deploy_view_once', deploy.executor_code({'files': files}).rsplit('print(json.dumps', 1)[0])
        self.assertEqual(base.TRANSITIONS[107], 'deploy_view_once')

    def test_review_pins_both_full_sources_and_prior_accounting(self):
        sql = once.previous.search.directory.ranking.capacity
        with (patch.object(base, 'reviewed_database') as reviewed,
              patch.object(base, 'verify_community_tables'),
              patch.object(base, 'digest', return_value='same'),
              patch.object(sql, 'psql', return_value=b't')):
            once.review(Path('candidate'), Path('live'))
        self.assertEqual(reviewed.call_args.args[2], {'before': once.BEFORE,
            'reviewed': once.REVIEWED, 'versions': 107, 'previous_versions': 106})
        self.assertIn('tgrelid)=98', once.COUNTER_CHECKS)
        self.assertIn('sources<>98', once.GLOBAL_CHECK)
        with (patch.object(base, 'reviewed_database'),
              patch.object(base, 'verify_community_tables'),
              patch.object(base, 'digest', return_value='same'),
              patch.object(sql, 'psql', return_value=b'f'), self.assertRaises(RuntimeError)):
            once.review(Path('candidate'), Path('live'))

    def test_any_preserved_data_or_history_drift_refuses_activation(self):
        before = {'versions': list(range(1, 107)), 'tables': {'accounts': 'same'}}
        after = {'versions': list(range(1, 108)), 'tables': before['tables']}
        sql = once.previous.search.directory.ranking.capacity
        for value in [dict(after, tables={}), dict(after, versions=[]), after]:
            with (patch.object(once, 'snapshot', return_value=value),
                  patch.object(base, 'attachment_versions', return_value=after['versions']),
                  patch.object(base, 'verify_community_tables') as tables,
                  patch.object(sql, 'psql', return_value=b't')):
                if value == after:
                    once.verify_migration(Path('candidate'), before)
                    tables.assert_called_once_with(once.TABLES + once.NEW_TABLES)
                else:
                    with self.assertRaises(RuntimeError):
                        once.verify_migration(Path('candidate'), before)
        with self.assertRaises(RuntimeError):
            once.activate({}, Path('work'), Path('candidate'), {})
