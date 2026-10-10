"""Exact profile description migration; no SSH or live database."""

from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'infra/staging'))
import deploy_profile_description as descriptions
import deploy_remote as base
import deploy_blocks45 as backups


class DescriptionMigrationReviewTests(unittest.TestCase):
    def test_missing_exact_source_review_refuses_before_database_access(self):
        with (patch.object(descriptions, 'REVIEWED', 'UNREVIEWED'),
              patch.object(backups, 'git_export') as git,
              patch.object(backups, 'pg') as database,
              self.assertRaisesRegex(RuntimeError, 'exact source review')):
            descriptions.review(Path('candidate'), Path('live'))
        git.assert_not_called()
        database.assert_not_called()

    def test_review_binds_predecessor_53_migrations_and_unchanged_worker_units(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            old, new = root / 'old', root / 'new'
            previous = {'src/main.ts': b'old', 'package.json': b'{}',
                        'package-lock.json': b'lock', '.nvmrc': b'24.14.0'}
            approved = dict(previous, **{'src/main.ts': b'description'})
            for version in range(1, 54):
                name = 'src/server/database/migrations/%03d.sql' % version
                approved[name] = ('migration %d' % version).encode()
                if version <= 52: previous[name] = approved[name]
            for folder, files in [(old, previous), (new, approved)]:
                for name, value in files.items():
                    path = folder / name
                    path.parent.mkdir(parents=True, exist_ok=True)
                    path.write_bytes(value)
                for unit in descriptions.background.UNITS:
                    path = folder / 'infra/staging' / unit
                    path.parent.mkdir(parents=True, exist_ok=True)
                    path.write_bytes(b'unchanged worker')
            revision = 'c' * 40
            exports = {descriptions.BEFORE: previous, revision: approved}
            with (patch.object(descriptions, 'REVIEWED', revision),
                  patch.object(backups, 'git_export', side_effect=lambda sha: exports[sha]),
                  patch.object(base, 'verify_community_tables')):
                descriptions.review(new, old)
                for name in ['src/main.ts', 'src/server/database/migrations/001.sql',
                             'src/server/database/migrations/052.sql',
                             'infra/staging/' + descriptions.background.UNITS[0]]:
                    path = new / name
                    before = path.read_bytes()
                    path.write_bytes(b'unreviewed')
                    with self.assertRaises(RuntimeError): descriptions.review(new, old)
                    path.write_bytes(before)

    def test_migration_refuses_changed_records_checksums_or_nonempty_table(self):
        versions = [{'version': value, 'checksum': str(value)} for value in range(1, 54)]
        before = {'versions': versions[:52], 'tables': {'existing': 'preserved'}}
        after = dict(before, versions=versions)
        with (patch.object(descriptions, 'snapshot', return_value=after),
              patch.object(base, 'attachment_versions', return_value=versions),
              patch.object(base, 'verify_community_tables'),
              patch.object(backups, 'pg', return_value=b't')):
            descriptions.verify_migration(Path('candidate'), before)
        for invalid in [dict(after, tables={}), dict(after, versions=versions[:52])]:
            with (patch.object(descriptions, 'snapshot', return_value=invalid),
                  patch.object(base, 'attachment_versions', return_value=versions),
                  self.assertRaisesRegex(RuntimeError, 'records or checksums')):
                descriptions.verify_migration(Path('candidate'), before)
        with (patch.object(descriptions, 'snapshot', return_value=after),
              patch.object(base, 'attachment_versions', return_value=versions),
              patch.object(base, 'verify_community_tables'),
              patch.object(backups, 'pg', return_value=b'f'),
              self.assertRaisesRegex(RuntimeError, 'not empty')):
            descriptions.verify_migration(Path('candidate'), before)

    def test_dispatch_selects_this_transition_for_53_migrations(self):
        with tempfile.TemporaryDirectory() as directory:
            candidate = Path(directory)
            migrations = candidate / 'src/server/database/migrations'
            migrations.mkdir(parents=True)
            for version in range(1, 54):
                (migrations / ('%03d.sql' % version)).write_text('-- fixture')
            with patch.object(descriptions, 'review') as review:
                base.database_review(candidate, Path('live'))
            review.assert_called_once_with(candidate, Path('live'))


if __name__ == '__main__':
    unittest.main()
