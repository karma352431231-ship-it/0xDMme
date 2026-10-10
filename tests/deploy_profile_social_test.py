"""Exact profile migration and existing workers; no SSH or live database."""

from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'infra/staging'))
import deploy_profile_social as profiles
import deploy_remote as base
import deploy_blocks45 as backups
import deploy_pipeline_test as pipeline


class ExistingWorkerMigrationTests(unittest.TestCase):
    def test_existing_workers_stop_for_schema_and_resume_after_success(self):
        pipeline.AttachmentDeploymentTests().check_activation(None, existing_workers=True)

    def test_preopening_rollback_resumes_existing_workers(self):
        pipeline.AttachmentDeploymentTests().check_activation('migration', existing_workers=True)

    def test_postopening_failure_stops_workers_without_restoring_new_data(self):
        pipeline.AttachmentDeploymentTests().check_activation('opened', existing_workers=True)

    def test_worker_readiness_failure_preserves_new_data_and_stops_all_own_writers(self):
        pipeline.AttachmentDeploymentTests().check_activation('worker-start', existing_workers=True)

    def test_partial_worker_stop_returns_old_services_without_migration(self):
        pipeline.AttachmentDeploymentTests().check_activation('worker-stop', existing_workers=True)


class ProfileMigrationReviewTests(unittest.TestCase):
    def test_missing_exact_source_review_refuses_before_database_access(self):
        with (patch.object(profiles, 'REVIEWED', 'UNREVIEWED'),
              patch.object(backups, 'git_export') as git,
              patch.object(backups, 'pg') as database,
              self.assertRaisesRegex(RuntimeError, 'exact source review')):
            profiles.review(Path('candidate'), Path('live'))
        git.assert_not_called()
        database.assert_not_called()

    def test_review_binds_predecessor_52_migrations_and_unchanged_worker_units(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            old, new = root / 'old', root / 'new'
            previous = {'src/main.ts': b'old', 'package.json': b'{}',
                        'package-lock.json': b'lock', '.nvmrc': b'24.14.0'}
            approved = dict(previous, **{'src/main.ts': b'profile'})
            for version in range(1, 53):
                name = 'src/server/database/migrations/%03d.sql' % version
                approved[name] = ('migration %d' % version).encode()
                if version <= 49: previous[name] = approved[name]
            for folder, files in [(old, previous), (new, approved)]:
                for name, value in files.items():
                    path = folder / name
                    path.parent.mkdir(parents=True, exist_ok=True)
                    path.write_bytes(value)
                for unit in profiles.background.UNITS:
                    path = folder / 'infra/staging' / unit
                    path.parent.mkdir(parents=True, exist_ok=True)
                    path.write_bytes(b'unchanged worker')
            revision = 'c' * 40
            exports = {profiles.BEFORE: previous, revision: approved}
            with (patch.object(profiles, 'REVIEWED', revision),
                  patch.object(backups, 'git_export', side_effect=lambda sha: exports[sha]),
                  patch.object(base, 'verify_community_tables')):
                profiles.review(new, old)
                for name in ['src/main.ts', 'src/server/database/migrations/001.sql',
                             'src/server/database/migrations/050.sql',
                             'infra/staging/' + profiles.background.UNITS[0]]:
                    path = new / name
                    before = path.read_bytes()
                    path.write_bytes(b'unreviewed')
                    with self.assertRaises(RuntimeError): profiles.review(new, old)
                    path.write_bytes(before)

    def test_migration_refuses_changed_records_checksums_or_unexpected_initial_state(self):
        versions = [{'version': value, 'checksum': str(value)} for value in range(1, 53)]
        before = {'versions': versions[:49], 'tables': {'existing': 'preserved'}}
        after = dict(before, versions=versions)
        with (patch.object(profiles, 'snapshot', return_value=after),
              patch.object(base, 'attachment_versions', return_value=versions),
              patch.object(base, 'verify_community_tables'),
              patch.object(backups, 'pg', return_value=b't')):
            profiles.verify_migration(Path('candidate'), before)
        for invalid in [dict(after, tables={}), dict(after, versions=versions[:49])]:
            with (patch.object(profiles, 'snapshot', return_value=invalid),
                  patch.object(base, 'attachment_versions', return_value=versions),
                  self.assertRaisesRegex(RuntimeError, 'records or checksums')):
                profiles.verify_migration(Path('candidate'), before)
        with (patch.object(profiles, 'snapshot', return_value=after),
              patch.object(base, 'attachment_versions', return_value=versions),
              patch.object(base, 'verify_community_tables'),
              patch.object(backups, 'pg', return_value=b'f'),
              self.assertRaisesRegex(RuntimeError, 'initial defaults')):
            profiles.verify_migration(Path('candidate'), before)


if __name__ == '__main__':
    unittest.main()
