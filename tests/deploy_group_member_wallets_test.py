"""The group member wallet release keeps exact schema/runtime guards."""
from unittest.mock import patch
import deploy_source_text_test as contracts
import deploy_reviewed_code as reviewed_code

remote = contracts.remote
backups = contracts.backups


class GroupMemberWalletsReviewTests(contracts.SourceTextReviewTests):
    before = reviewed_code.GROUP_MEMBER_WALLETS_BEFORE
    reviewed = reviewed_code.GROUP_MEMBER_WALLETS_REVIEWED
    review_modules = reviewed_code.GROUP_MEMBER_WALLETS_MODULES

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
