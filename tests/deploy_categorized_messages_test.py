"""Exact categorized-change publication; synthetic fixtures contain no VPS access."""
import unittest
from unittest.mock import patch
import deploy_pipeline_test as fixtures
import deploy_reviewed_code as reviewed_code

remote = fixtures.remote
backups = fixtures.backups


class CategorizedMessagesReviewTests(unittest.TestCase):
    def setUp(self):
        fixture = fixtures.CommunityFeedCodeTests()
        fixture.setUp()
        self.addCleanup(fixture.doCleanups)
        self.live, self.candidate = fixture.live, fixture.candidate
        for name in ['communities.ts', 'community-discovery.ts']:
            (self.candidate / 'src/server/database' / name).write_bytes(
                (self.live / 'src/server/database' / name).read_bytes())
        for name in reviewed_code.CATEGORIZED_MESSAGES_MODULES:
            if name != 'transaction-changes.ts':
                (self.live / 'src/server/database' / name).write_text('previous operation')
            (self.candidate / 'src/server/database' / name).write_text('reviewed operation')
        self.exports = {
            reviewed_code.CATEGORIZED_MESSAGES_BEFORE: fixture.export(self.live),
            reviewed_code.CATEGORIZED_MESSAGES_REVIEWED: fixture.export(self.candidate),
        }

    def test_exact_trees_use_code_exchange_without_a_migration(self):
        with (patch.object(backups, 'git_export', side_effect=lambda sha: self.exports[sha]),
              patch.object(remote, 'run', return_value=b'v24.18.1'),
              patch.object(remote, 'database_review') as migration):
            remote.compatibility(self.candidate, self.live)
            migration.assert_not_called()
            self.assertTrue(remote.database_code_reviewed(self.candidate, self.live))

    def test_any_changed_operation_or_predecessor_invalidates_review(self):
        paths = [(self.candidate, name) for name in reviewed_code.CATEGORIZED_MESSAGES_MODULES]
        paths += [(self.live, 'contacts.ts')]
        for root, name in paths:
            with self.subTest(path=name, candidate=root == self.candidate):
                path = root / 'src/server/database' / name
                original = path.read_bytes()
                path.write_text('unreviewed operation')
                try:
                    with patch.object(backups, 'git_export', side_effect=lambda sha: self.exports[sha]):
                        self.assertFalse(remote.database_code_reviewed(self.candidate, self.live))
                finally:
                    path.write_bytes(original)

    def test_extra_or_missing_module_and_schema_changes_remain_blocked(self):
        for name in ['unreviewed.ts', 'migrations/095-unreviewed.sql']:
            with self.subTest(path=name):
                path = self.candidate / 'src/server/database' / name
                path.write_text('unreviewed operation or schema')
                try:
                    with patch.object(backups, 'git_export', side_effect=lambda sha: self.exports[sha]):
                        self.assertFalse(remote.database_code_reviewed(self.candidate, self.live))
                finally:
                    path.unlink()
        (self.candidate / 'src/server/database/transaction-changes.ts').unlink()
        with patch.object(backups, 'git_export', side_effect=lambda sha: self.exports[sha]):
            self.assertFalse(remote.database_code_reviewed(self.candidate, self.live))

    def test_runtime_changes_are_not_authorized_by_database_review(self):
        for name in ['package-lock.json', '.nvmrc']:
            with self.subTest(path=name):
                path = self.candidate / name
                original = path.read_bytes()
                path.write_text('unreviewed runtime')
                try:
                    with (patch.object(backups, 'git_export', side_effect=lambda sha: self.exports[sha]),
                          self.assertRaises(RuntimeError)):
                        remote.compatibility(self.candidate, self.live)
                finally:
                    path.write_bytes(original)

    def test_code_transport_omits_only_unused_optional_installers(self):
        import subprocess
        import sys
        deploy = fixtures.deploy
        files = {str(path.relative_to(deploy.ROOT)): remote.digest(path)
                 for path in (deploy.ROOT / 'infra/staging').glob('deploy_*.py')}
        code = deploy.executor_code({'files': files})
        safe = code.rsplit('print(json.dumps', 1)[0]
        safe += 'assert "deploy_worker_boot" not in sys.modules\n'
        safe += 'assert "deploy_profile_directory" not in sys.modules\n'
        safe += 'assert callable(sys.modules["deploy_remote"].database_code_reviewed)\n'
        subprocess.run([sys.executable, '-c', safe], capture_output=True, check=True, timeout=10)
