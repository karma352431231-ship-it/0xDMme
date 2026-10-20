"""Exact notification classification/avatar code exchange; no schema, runtime or unrelated source approval."""
import unittest
from unittest.mock import patch
import deploy_pipeline_test as fixtures

remote = fixtures.remote
backups = fixtures.backups


class PreviewNotificationsReviewTests(unittest.TestCase):
    def setUp(self):
        fixture = fixtures.CommunityFeedCodeTests()
        fixture.setUp()
        self.addCleanup(fixture.doCleanups)
        self.live, self.candidate = fixture.live, fixture.candidate
        for name in ['communities.ts', 'community-discovery.ts']:
            (self.candidate / 'src/server/database' / name).write_bytes(
                (self.live / 'src/server/database' / name).read_bytes())
        self.modules = ['daily.ts', 'public-notification-preview.ts', 'push-private-activity.ts']
        for name in self.modules[:2]:
            (self.live / 'src/server/database' / name).write_text('existing notification reader')
        for name in self.modules:
            (self.candidate / 'src/server/database' / name).write_text('reviewed notification reader')
        self.exports = {remote.PREVIEW_NOTIFICATIONS_BEFORE: fixture.export(self.live),
                        remote.PREVIEW_NOTIFICATIONS_REVIEWED: fixture.export(self.candidate)}

    def test_exact_complete_sources_use_code_exchange_without_schema_review(self):
        with (patch.object(backups, 'git_export', side_effect=lambda sha: self.exports[sha]),
              patch.object(remote, 'run', return_value=b'v24.14.0'),
              patch.object(remote, 'database_review') as migration):
            remote.compatibility(self.candidate, self.live)
            migration.assert_not_called()
            self.assertTrue(remote.database_code_reviewed(self.candidate, self.live))

    def test_changed_module_or_predecessor_cannot_reuse_the_approval(self):
        for name in self.modules:
            path = self.candidate / 'src/server/database' / name
            saved = path.read_bytes()
            path.write_text('unreviewed source')
            try:
                with patch.object(backups, 'git_export', side_effect=lambda sha: self.exports[sha]):
                    self.assertFalse(remote.database_code_reviewed(self.candidate, self.live))
            finally:
                path.write_bytes(saved)
        (self.live / 'src/server/database/daily.ts').write_text('different predecessor')
        with patch.object(backups, 'git_export', side_effect=lambda sha: self.exports[sha]):
            self.assertFalse(remote.database_code_reviewed(self.candidate, self.live))

    def test_extra_source_or_migration_never_becomes_a_code_exchange(self):
        for name in ['unreviewed.ts', 'migrations/094-unreviewed.sql']:
            path = self.candidate / 'src/server/database' / name
            path.write_text('unreviewed source or schema')
            try:
                with patch.object(backups, 'git_export', side_effect=lambda sha: self.exports[sha]):
                    self.assertFalse(remote.database_code_reviewed(self.candidate, self.live))
            finally:
                path.unlink()
