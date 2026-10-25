"""The created-communities list release keeps exact schema/runtime guards."""
from unittest.mock import patch
import deploy_source_text_test as contracts
import deploy_reviewed_code as reviewed_code

remote = contracts.remote
backups = contracts.backups


class CreatedCommunitiesReviewTests(contracts.SourceTextReviewTests):
    before = reviewed_code.CREATED_COMMUNITIES_BEFORE
    reviewed = reviewed_code.CREATED_COMMUNITIES_REVIEWED
    review_modules = reviewed_code.CREATED_COMMUNITIES_MODULES

    def setUp(self):
        super().setUp()
        # The community reader release also reviews communities.ts alone.
        self.exports = contracts.CommitExports(self.exports)

    def test_list_review_does_not_approve_runtime_changes(self):
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
