"""Exact code-only upload correction; never approve a schema/runtime delta."""
import unittest
from unittest.mock import patch
import deploy_pipeline_test as fixtures
import deploy_reviewed_code as reviewed_code

remote = fixtures.remote
backups = fixtures.backups


class UploadLifecycleReviewTests(unittest.TestCase):
    def setUp(self):
        fixture = fixtures.CommunityFeedCodeTests()
        fixture.setUp()
        self.addCleanup(fixture.doCleanups)
        self.live, self.candidate = fixture.live, fixture.candidate
        for name in ['communities.ts', 'community-discovery.ts']:
            (self.candidate / 'src/server/database' / name).write_bytes(
                (self.live / 'src/server/database' / name).read_bytes())
        self.modules = ['attachments.ts', 'group-media.ts', 'social-media.ts', 'status-media.ts', 'upload-recovery.ts']
        for name in self.modules:
            if name != 'upload-recovery.ts':
                (self.live / 'src/server/database' / name).write_text('existing lifecycle')
            (self.candidate / 'src/server/database' / name).write_text('reviewed lifecycle')
        self.exports = {reviewed_code.UPLOAD_LIFECYCLE_BEFORE: fixture.export(self.live),
                        reviewed_code.UPLOAD_LIFECYCLE_REVIEWED: fixture.export(self.candidate)}

    def test_exact_complete_sources_use_code_compatibility_without_schema_review(self):
        with (patch.object(backups, 'git_export', side_effect=lambda sha: self.exports[sha]),
              patch.object(remote, 'run', return_value=b'v24.14.0'),
              patch.object(remote, 'database_review') as migration):
            remote.compatibility(self.candidate, self.live)
            migration.assert_not_called()
            self.assertTrue(remote.database_code_reviewed(self.candidate, self.live))

    def test_every_changed_module_and_predecessor_must_match_the_review(self):
        for name in self.modules:
            with self.subTest(module=name):
                path = self.candidate / 'src/server/database' / name
                before = path.read_bytes()
                path.write_text('unreviewed mutation')
                try:
                    with patch.object(backups, 'git_export', side_effect=lambda sha: self.exports[sha]):
                        self.assertFalse(remote.database_code_reviewed(self.candidate, self.live))
                finally:
                    path.write_bytes(before)
        path = self.live / 'src/server/database/attachments.ts'
        path.write_text('different live predecessor')
        with patch.object(backups, 'git_export', side_effect=lambda sha: self.exports[sha]):
            self.assertFalse(remote.database_code_reviewed(self.candidate, self.live))

    def test_extra_module_or_migration_change_is_not_code_only(self):
        directory = self.candidate / 'src/server/database'
        for name in ['unreviewed.ts', 'migrations/092-unreviewed.sql']:
            with self.subTest(path=name):
                path = directory / name
                path.write_text('unreviewed source or schema')
                try:
                    with patch.object(backups, 'git_export', side_effect=lambda sha: self.exports[sha]):
                        self.assertFalse(remote.database_code_reviewed(self.candidate, self.live))
                finally:
                    path.unlink()
