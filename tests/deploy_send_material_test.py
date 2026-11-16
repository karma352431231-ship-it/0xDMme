"""The send preparation release preserves exact schema/runtime guards."""
from unittest.mock import patch
import deploy_source_text_test as contracts
import deploy_database_code_review as reviewed_code


class SendMaterialReviewTests(contracts.SourceTextReviewTests):
    before = reviewed_code.SEND_MATERIAL_BEFORE
    reviewed = reviewed_code.SEND_MATERIAL_REVIEWED
    review_modules = reviewed_code.SEND_MATERIAL_MODULES

    def test_send_review_never_approves_runtime_changes(self):
        for name in ['package-lock.json', '.nvmrc']:
            with self.subTest(path=name):
                path = self.candidate / name
                original = path.read_bytes()
                path.write_text('unreviewed runtime')
                try:
                    with (patch.object(contracts.backups, 'git_export', side_effect=lambda sha: self.exports[sha]),
                          self.assertRaises(RuntimeError)):
                        contracts.remote.compatibility(self.candidate, self.live)
                finally:
                    path.write_bytes(original)


class IdentitySnapshotReviewTests(SendMaterialReviewTests):
    before = reviewed_code.IDENTITY_SNAPSHOT_BEFORE
    reviewed = reviewed_code.IDENTITY_SNAPSHOT_REVIEWED
    review_modules = reviewed_code.IDENTITY_SNAPSHOT_MODULES
