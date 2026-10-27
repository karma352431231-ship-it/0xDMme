"""Read-only operational counters retain exact database and runtime guards."""
from unittest.mock import patch
import deploy_source_text_test as contracts
import deploy_reviewed_code as reviewed_code


class OperationalHealthReviewTests(contracts.SourceTextReviewTests):
    before = reviewed_code.OPERATIONAL_HEALTH_BEFORE
    reviewed = reviewed_code.OPERATIONAL_HEALTH_REVIEWED
    review_modules = reviewed_code.OPERATIONAL_HEALTH_MODULES

    def setUp(self):
        super().setUp()
        # The reviewed transition adds this module to the previous tree.
        (self.live / 'src/server/database/operational-health.ts').unlink()
        del self.exports[self.before]['src/server/database/operational-health.ts']

    def test_operational_review_does_not_approve_runtime_changes(self):
        for name in ['package-lock.json', '.nvmrc']:
            with self.subTest(path=name):
                path = self.candidate / name
                original = path.read_bytes()
                path.write_text('unreviewed runtime')
                try:
                    with (patch.object(contracts.backups, 'git_export',
                                       side_effect=lambda sha: self.exports[sha]),
                          self.assertRaises(RuntimeError)):
                        contracts.remote.compatibility(self.candidate, self.live)
                finally:
                    path.write_bytes(original)
