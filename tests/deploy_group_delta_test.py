"""The one-request group delta release keeps exact schema/runtime guards."""
from unittest.mock import patch
import deploy_source_text_test as contracts

remote = contracts.remote
backups = contracts.backups


class GroupDeltaReviewTests(contracts.SourceTextReviewTests):
    before = remote.GROUP_DELTA_BEFORE
    reviewed = remote.GROUP_DELTA_REVIEWED
    review_modules = remote.GROUP_DELTA_MODULES

    def test_database_read_review_does_not_approve_runtime_changes(self):
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
