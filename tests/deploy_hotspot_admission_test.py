"""The reviewed admission refactor never approves schema/runtime changes."""
from unittest.mock import patch
import deploy_source_text_test as contracts
import deploy_reviewed_code as reviewed_code


class HotspotAdmissionReviewTests(contracts.SourceTextReviewTests):
    before = reviewed_code.HOTSPOT_ADMISSION_BEFORE
    reviewed = reviewed_code.HOTSPOT_ADMISSION_REVIEWED
    review_modules = reviewed_code.HOTSPOT_ADMISSION_MODULES

    def test_admission_review_does_not_authorize_runtime_changes(self):
        for name in ['package-lock.json', '.nvmrc']:
            with self.subTest(path=name):
                path = self.candidate / name
                original = path.read_bytes()
                path.write_text('unreviewed runtime')
                try:
                    with (patch.object(contracts.backups, 'git_export', side_effect=lambda revision: self.exports[revision]),
                          self.assertRaises(RuntimeError)):
                        contracts.remote.compatibility(self.candidate, self.live)
                finally:
                    path.write_bytes(original)
