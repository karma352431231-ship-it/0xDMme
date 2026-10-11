"""Exact private-group admission migration; no SSH or live database."""

from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'infra/staging'))
import deploy_group_links as links
import deploy_remote as base
import deploy_blocks45 as backups


class GroupLinkMigrationReviewTests(unittest.TestCase):
    def test_missing_exact_source_review_refuses_before_database_access(self):
        with (patch.object(links, 'REVIEWED', 'UNREVIEWED'),
              patch.object(backups, 'git_export') as git,
              patch.object(backups, 'pg') as database,
              self.assertRaisesRegex(RuntimeError, 'exact source review')):
            links.review(Path('candidate'), Path('live'))
        git.assert_not_called()
        database.assert_not_called()

    def test_review_binds_live_sources_54_migrations_and_unchanged_workers(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            old, new = root / 'old', root / 'new'
            previous = {'src/main.ts': b'old', 'package.json': b'{}',
                        'package-lock.json': b'lock', '.nvmrc': b'24.14.0'}
            approved = dict(previous, **{'src/main.ts': b'group admission'})
            for version in range(1, 55):
                name = 'src/server/database/migrations/%03d.sql' % version
                approved[name] = ('migration %d' % version).encode()
                if version <= 53: previous[name] = approved[name]
            for folder, files in [(old, previous), (new, approved)]:
                for name, value in files.items():
                    path = folder / name
                    path.parent.mkdir(parents=True, exist_ok=True)
                    path.write_bytes(value)
                for unit in links.background.UNITS:
                    path = folder / 'infra/staging' / unit
                    path.parent.mkdir(parents=True, exist_ok=True)
                    path.write_bytes(b'unchanged worker')
            exports = {links.BEFORE: previous, links.REVIEWED: approved}
            with (patch.object(backups, 'git_export', side_effect=lambda sha: exports[sha]),
                  patch.object(base, 'verify_community_tables')):
                links.review(new, old)
                for folder, name in [(old, 'src/main.ts'), (new, 'src/main.ts'),
                                     (new, 'src/server/database/migrations/001.sql'),
                                     (new, 'src/server/database/migrations/053.sql'),
                                     (new, 'src/server/database/migrations/054.sql'),
                                     (new, 'package-lock.json'),
                                     (new, 'infra/staging/' + links.background.UNITS[0])]:
                    with self.subTest(folder=folder.name, name=name):
                        path = folder / name
                        before = path.read_bytes()
                        path.write_bytes(b'unreviewed')
                        with self.assertRaises(RuntimeError): links.review(new, old)
                        path.write_bytes(before)

    def test_migration_preserves_rows_checksums_and_requires_empty_accounted_table(self):
        versions = [{'version': value, 'checksum': str(value)} for value in range(1, 55)]
        before = {'versions': versions[:53], 'tables': {'existing': 'preserved'}}
        after = dict(before, versions=versions)
        with (patch.object(links, 'snapshot', return_value=after),
              patch.object(base, 'attachment_versions', return_value=versions),
              patch.object(base, 'verify_community_tables'),
              patch.object(backups, 'pg', return_value=b't')):
            links.verify_migration(Path('candidate'), before)
        for invalid in [dict(after, tables={}), dict(after, versions=versions[:53])]:
            with (patch.object(links, 'snapshot', return_value=invalid),
                  patch.object(base, 'attachment_versions', return_value=versions),
                  self.assertRaisesRegex(RuntimeError, 'records or checksums')):
                links.verify_migration(Path('candidate'), before)
        with (patch.object(links, 'snapshot', return_value=after),
              patch.object(base, 'attachment_versions', return_value=versions),
              patch.object(base, 'verify_community_tables'),
              patch.object(backups, 'pg', return_value=b'f'),
              self.assertRaisesRegex(RuntimeError, 'not empty')):
            links.verify_migration(Path('candidate'), before)

    def test_dispatch_selects_this_transition_for_54_migrations(self):
        with tempfile.TemporaryDirectory() as directory:
            candidate = Path(directory)
            migrations = candidate / 'src/server/database/migrations'
            migrations.mkdir(parents=True)
            for version in range(1, 55):
                (migrations / ('%03d.sql' % version)).write_text('-- fixture')
            with patch.object(links, 'review') as review:
                base.database_review(candidate, Path('live'))
            review.assert_called_once_with(candidate, Path('live'))


if __name__ == '__main__':
    unittest.main()
