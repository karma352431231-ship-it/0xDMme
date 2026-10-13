"""Exact mention migration guards; no SSH or production database."""
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'infra/staging'))
import deploy_mentions as mentions
import deploy_remote as base
import deploy_blocks45 as backups


class MentionMigrationTests(unittest.TestCase):
    def test_unreviewed_sources_fail_before_database(self):
        with (patch.object(mentions, 'REVIEWED', 'UNREVIEWED'),
              patch.object(base, 'reviewed_database') as reviewed,
              patch.object(backups, 'pg') as pg,
              self.assertRaisesRegex(RuntimeError, 'exact source review')):
            mentions.review(Path('candidate'), Path('live'))
        reviewed.assert_not_called()
        pg.assert_not_called()

    def test_exact_dispatch_and_lifecycle_preserve_existing_executor(self):
        with tempfile.TemporaryDirectory() as directory:
            candidate = Path(directory)
            migrations = candidate / 'src/server/database/migrations'
            migrations.mkdir(parents=True)
            for n in range(1, 65):
                (migrations / ('%03d.sql' % n)).write_text('-- fixture')
            with patch.object(mentions,'review') as review:
                base.database_review(candidate,Path('live'))
                review.assert_called_once_with(candidate,Path('live'))
        with (patch.object(mentions.background,'verify_current'),
              patch.object(base,'activate_database',return_value={'published':True}) as activate):
            mentions.activate({},Path('work'),Path('candidate'),{})
            contract=activate.call_args.args[3]
            self.assertEqual(contract['versions'],62)
            self.assertIs(contract['snapshot'],mentions.snapshot)
            self.assertIs(contract['verify'],mentions.verify_migration)
            self.assertIs(contract['stop_existing'],mentions.background.stop)
            self.assertIs(contract['resume_existing'],mentions.background.start)

    def test_existing_rows_ledger_checksums_and_new_schema_are_guarded(self):
        versions=[{'version':n,'checksum':str(n)} for n in range(1,65)]
        before={'versions':versions[:62],'tables':{'preserved':'digest','content_usage':'ledger'}}
        after=dict(before,versions=versions)
        for invalid in [dict(after,versions=versions[:62]),dict(after,tables={'preserved':'changed'}),dict(after,tables={'preserved':'digest','content_usage':'changed'})]:
            with (patch.object(mentions,'snapshot',return_value=invalid),
                  patch.object(base,'attachment_versions',return_value=versions),
                  self.assertRaisesRegex(RuntimeError,'existing rows, ledger or checksums')):
                mentions.verify_migration(Path('candidate'),before)
        with (patch.object(mentions,'snapshot',return_value=after),
              patch.object(base,'attachment_versions',return_value=versions),
              patch.object(base,'verify_community_tables'),
              patch.object(backups,'pg',return_value=b'f'),
              self.assertRaisesRegex(RuntimeError,'constraints, empty table, indexes or accounting')):
            mentions.verify_migration(Path('candidate'),before)

    def test_colliding_names_are_refused_before_maintenance(self):
        with (patch.object(base,'reviewed_database'),patch.object(base,'verify_community_tables'),
              patch.object(base,'digest',return_value='unchanged'),patch.object(backups,'pg',return_value=b'f'),
              self.assertRaisesRegex(RuntimeError,'Unique community names')):
            mentions.review(Path('candidate'),Path('live'))
