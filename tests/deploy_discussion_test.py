"""Exact discussion migration guards; no SSH or production database."""
from pathlib import Path
import sys, tempfile, unittest
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'infra/staging'))
import deploy_discussion as discussion
import deploy_remote as base
import deploy_blocks45 as backups


class DiscussionMigrationTests(unittest.TestCase):
    def test_unreviewed_sources_fail_before_accessing_database(self):
        with (patch.object(discussion, 'REVIEWED', 'UNREVIEWED'),
              patch.object(base, 'reviewed_database') as reviewed,
              patch.object(backups, 'pg') as pg,
              self.assertRaisesRegex(RuntimeError, 'exact source review')):
            discussion.review(Path('candidate'), Path('live'))
        reviewed.assert_not_called(); pg.assert_not_called()

    def test_dispatch_and_lifecycle_reuse_preserving_executor(self):
        with tempfile.TemporaryDirectory() as directory:
            candidate = Path(directory); migrations = candidate / 'src/server/database/migrations'; migrations.mkdir(parents=True)
            for n in range(1, 63): (migrations / ('%03d.sql' % n)).write_text('-- fixture')
            with patch.object(discussion, 'review') as review:
                base.database_review(candidate, Path('live'))
                review.assert_called_once_with(candidate, Path('live'))
        with (patch.object(discussion.background, 'verify_current'),
              patch.object(base, 'activate_database', return_value={'published': True}) as activate):
            discussion.activate({}, Path('work'), Path('candidate'), {})
            contract = activate.call_args.args[3]
            self.assertEqual(contract['versions'], 61)
            self.assertIs(contract['snapshot'], discussion.snapshot)
            self.assertIs(contract['verify'], discussion.verify_migration)
            self.assertIs(contract['stop_existing'], discussion.background.stop)
            self.assertIs(contract['resume_existing'], discussion.background.start)

    def test_preservation_rejects_any_wrong_counter_ledger_or_checksum(self):
        versions = [{'version': n, 'checksum': str(n)} for n in range(1, 63)]
        before = {'versions': versions[:61], 'tables': {'preserved': 'digest'},
                  'expected_used_bytes': 256, 'participants': {'count': 1, 'hash': 'pairs'}, 'metrics': 'metrics'}
        after = dict(before, versions=versions)
        actual = {'used_bytes': 256, 'participants': before['participants'], 'metrics': 'metrics'}
        for invalid in [dict(actual, used_bytes=0), dict(actual, participants={}), dict(actual, metrics='wrong')]:
            with (patch.object(discussion, 'snapshot', return_value=after),
                  patch.object(base, 'attachment_versions', return_value=versions),
                  patch.object(discussion, 'metadata', return_value=invalid),
                  self.assertRaisesRegex(RuntimeError, 'preservation failed')):
                discussion.verify_migration(Path('candidate'), before)
