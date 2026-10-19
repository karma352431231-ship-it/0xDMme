"""Exact code-only source text release; never approve a schema/runtime delta."""
import unittest
from unittest.mock import patch
import deploy_pipeline_test as fixtures

remote = fixtures.remote
backups = fixtures.backups


class SourceTextReviewTests(unittest.TestCase):
    def setUp(self):
        fixture = fixtures.CommunityFeedCodeTests()
        fixture.setUp()
        self.addCleanup(fixture.doCleanups)
        self.live, self.candidate = fixture.live, fixture.candidate
        self.modules = sorted(remote.SOURCE_TEXT_MODULES)
        for name in self.modules:
            (self.live / 'src/server/database' / name).write_text('existing text')
            (self.candidate / 'src/server/database' / name).write_text('reviewed text')
        self.exports = {remote.SOURCE_TEXT_BEFORE: fixture.export(self.live),
                        remote.SOURCE_TEXT_REVIEWED: fixture.export(self.candidate)}

    def test_exact_complete_sources_use_code_compatibility_without_schema_review(self):
        with (patch.object(backups, 'git_export', side_effect=lambda sha: self.exports[sha]),
              patch.object(remote, 'run', return_value=b'v24.14.0'),
              patch.object(remote, 'database_review') as migration):
            remote.compatibility(self.candidate, self.live)
            migration.assert_not_called()
            self.assertTrue(remote.database_code_reviewed(self.candidate, self.live))

    def test_every_changed_module_and_predecessor_must_match_the_review(self):
        for name in ['communities.ts', 'devices.ts', 'vault.ts']:
            with self.subTest(module=name):
                path = self.candidate / 'src/server/database' / name
                before = path.read_bytes()
                path.write_text('unreviewed mutation')
                try:
                    with patch.object(backups, 'git_export', side_effect=lambda sha: self.exports[sha]):
                        self.assertFalse(remote.database_code_reviewed(self.candidate, self.live))
                finally:
                    path.write_bytes(before)
        path = self.live / 'src/server/database/messages.ts'
        path.write_text('different live predecessor')
        with patch.object(backups, 'git_export', side_effect=lambda sha: self.exports[sha]):
            self.assertFalse(remote.database_code_reviewed(self.candidate, self.live))

    def test_extra_module_or_migration_change_is_not_code_only(self):
        directory = self.candidate / 'src/server/database'
        for name in ['unreviewed.ts', 'migrations/093-unreviewed.sql']:
            with self.subTest(path=name):
                path = directory / name
                path.write_text('unreviewed source or schema')
                try:
                    with patch.object(backups, 'git_export', side_effect=lambda sha: self.exports[sha]):
                        self.assertFalse(remote.database_code_reviewed(self.candidate, self.live))
                finally:
                    path.unlink()
