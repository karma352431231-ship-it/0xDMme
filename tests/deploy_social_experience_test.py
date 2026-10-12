"""Review/preservation regressions for 058→061; never connects to the VPS."""
from pathlib import Path
import sys, tempfile, unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'infra/staging'))
import deploy_social_experience as experience
import deploy_remote as base
import deploy_blocks45 as backups


class SocialExperienceMigrationTests(unittest.TestCase):
    def test_missing_exact_review_refuses_before_database_access(self):
        with (patch.object(experience, 'REVIEWED', 'UNREVIEWED'),
              patch.object(backups, 'pg') as pg,
              patch.object(base, 'reviewed_database') as review,
              self.assertRaisesRegex(RuntimeError, 'exact source review')):
            experience.review(Path('candidate'), Path('live'))
        pg.assert_not_called(); review.assert_not_called()

    def test_review_rejects_changed_previous_migrations_sources_and_units(self):
        with tempfile.TemporaryDirectory() as directory:
            old, new = Path(directory) / 'old', Path(directory) / 'new'
            previous = {'src/main.ts': b'old', 'package.json': b'{}', 'package-lock.json': b'lock', '.nvmrc': b'24.14.0'}
            approved = dict(previous, **{'src/main.ts': b'social'})
            for version in range(1, 62):
                name = 'src/server/database/migrations/%03d.sql' % version
                approved[name] = str(version).encode()
                if version <= 58: previous[name] = approved[name]
            for root, files in [(old, previous), (new, approved)]:
                for name, value in files.items():
                    path = root / name; path.parent.mkdir(parents=True, exist_ok=True); path.write_bytes(value)
                for name in [base.UNIT, *experience.background.UNITS]:
                    path = root / 'infra/staging' / name; path.parent.mkdir(parents=True, exist_ok=True); path.write_bytes(b'unit')
            revision = 'c' * 40; exports = {experience.BEFORE: previous, revision: approved}
            with (patch.object(experience, 'REVIEWED', revision),
                  patch.object(backups, 'git_export', side_effect=lambda sha: exports[sha]),
                  patch.object(base, 'verify_community_tables')):
                experience.review(new, old)
                for name in ['src/server/database/migrations/058.sql', 'src/main.ts', 'infra/staging/' + base.UNIT]:
                    path = new / name; original = path.read_bytes(); path.write_bytes(b'unreviewed')
                    with self.assertRaises(RuntimeError): experience.review(new, old)
                    path.write_bytes(original)

    def test_preservation_keeps_ledger_and_all_old_receipt_fields(self):
        versions = [{'version': n, 'checksum': str(n)} for n in range(1, 62)]
        before = {'versions': versions[:58], 'tables': {'social_receipts': {'count': 2, 'hash': 'receipts'}, 'content_usage': {'count': 1, 'hash': 'ledger'}}}
        after = {'versions': versions, 'tables': before['tables']}
        with (patch.object(base, 'attachment_versions', return_value=versions),
              patch.object(base, 'verify_community_tables'), patch.object(backups, 'pg', return_value=b't'),
              patch.object(experience, 'snapshot', return_value=after)):
            experience.verify_migration(Path('candidate'), before)
        for invalid in [dict(after, tables={}), dict(after, versions=versions[:58]),
                        dict(after, tables=dict(before['tables'], content_usage={'count': 1, 'hash': 'changed'}))]:
            with (patch.object(base, 'attachment_versions', return_value=versions),
                  patch.object(experience, 'snapshot', return_value=invalid),
                  self.assertRaisesRegex(RuntimeError, 'records, checksums or ledger')):
                experience.verify_migration(Path('candidate'), before)
        with (patch.object(base, 'attachment_versions', return_value=versions),
              patch.object(base, 'verify_community_tables'), patch.object(backups, 'pg', return_value=b'f'),
              patch.object(experience, 'snapshot', return_value=after),
              self.assertRaisesRegex(RuntimeError, 'historical reads')):
            experience.verify_migration(Path('candidate'), before)
        with patch.object(backups, 'database_snapshot', return_value=before) as snapshot:
            self.assertEqual(experience.snapshot(), before)
            self.assertEqual(snapshot.call_args.kwargs['omit_columns'], {'social_receipts': ('read_epoch',)})

    def test_dispatch_and_lifecycle_use_existing_backup_restore_executor(self):
        with tempfile.TemporaryDirectory() as directory:
            candidate = Path(directory); migrations = candidate / 'src/server/database/migrations'; migrations.mkdir(parents=True)
            for n in range(1, 62): (migrations / ('%03d.sql' % n)).write_text('-- fixture')
            with patch.object(experience, 'review') as review:
                base.database_review(candidate, Path('live'))
            review.assert_called_once_with(candidate, Path('live'))
        with (patch.object(experience.background, 'verify_current'),
              patch.object(base, 'activate_database', return_value={'published': True}) as activate):
            self.assertEqual(experience.activate({}, Path('work'), Path('candidate'), {}), {'published': True})
            transition = activate.call_args.args[3]
            self.assertEqual(transition['versions'], 58)
            self.assertIs(transition['snapshot'], experience.snapshot)
            self.assertIs(transition['stop_existing'], experience.background.stop)
            self.assertIs(transition['resume_existing'], experience.background.start)


if __name__ == '__main__': unittest.main()
