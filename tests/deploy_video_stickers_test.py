"""The video stickers release verifies its exact check and preserves the prior rows."""
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'infra/staging'))
import deploy
import deploy_video_stickers as photos
import deploy_remote as base


MODE = {"video_stickers": True}


class VideoStickerDeploymentTests(unittest.TestCase):
    def test_executor_loads_the_review_only_for_the_explicit_transition(self):
        files = {'infra/staging/' + p.name: base.digest(p)
                 for p in (ROOT / 'infra/staging').glob('deploy_*.py')}
        code = deploy.executor_code({'files': files, **MODE})
        source = code.rsplit('print(json.dumps', 1)[0]
        source += 'assert callable(sys.modules["deploy_video_stickers"].activate)\n'
        source += 'assert "deploy_database_code_review" not in sys.modules\n'
        subprocess.run([sys.executable, '-c', source], check=True, capture_output=True, timeout=10)
        self.assertLess(len(code.encode()), 64 * 1024)
        self.assertTrue(base.schema_transition_requested(MODE))
        self.assertEqual(base.TRANSITIONS[117], "deploy_video_stickers")

    def test_activation_dispatch_reaches_the_video_sticker_review(self):
        with tempfile.TemporaryDirectory() as path:
            work = Path(path)
            candidate = work / 'candidate'
            migrations = candidate / 'src/server/database/migrations'
            migrations.mkdir(parents=True)
            for version in range(1, 118):
                (migrations / f'{version:03d}.sql').touch()
            with (patch.object(base, 'preflight', return_value={'running': True}),
                  patch.object(base, 'digest', return_value='archive'),
                  patch.object(base, 'receipt'),
                  patch.object(base, 'prepare', return_value=candidate),
                  patch.object(base, 'preservation'),
                  patch.object(base, 'own_state', return_value={'running': True}),
                  patch.object(base, 'database_files', side_effect=[{'new'}, {'old'}]),
                  patch.object(base, 'database_code_reviewed', side_effect=ModuleNotFoundError),
                  patch.object(photos, 'activate', return_value={'status': 'published'}) as dispatch):
                config = dict(MODE, archive_sha256='archive', commit='candidate', baseline={})
                self.assertEqual(base.activate(config, work), {'status': 'published'})
                dispatch.assert_called_once_with(config, work, candidate, {'running': True})

    def test_the_review_pins_the_migration_to_the_exact_sources(self):
        sql = photos.previous.search.directory.ranking.capacity
        with (patch.object(base, 'reviewed_database') as reviewed,
              patch.object(base, 'verify_community_tables') as tables,
              patch.object(base, 'digest', return_value='same'),
              patch.object(sql, 'psql', return_value=b't')):
            photos.review(Path('candidate'), Path('live'))
        self.assertEqual(reviewed.call_args.args[2], {
            'before': photos.BEFORE, 'reviewed': photos.REVIEWED,
            "versions": 117, "previous_versions": 116})
        for commit in (photos.BEFORE, photos.REVIEWED):
            self.assertRegex(commit, r'^[0-9a-f]{40}$')
        self.assertIn('public_stickers', tables.call_args.args[0])

    def test_review_refuses_a_predecessor_that_already_allows_video(self):
        sql = photos.previous.search.directory.ranking.capacity
        with (patch.object(base, 'reviewed_database'),
              patch.object(base, 'verify_community_tables'),
              patch.object(base, 'digest', return_value='same'),
              patch.object(sql, 'psql', return_value=b'f'),
              self.assertRaisesRegex(RuntimeError, 'predecessor schema or accounting differs')):
            photos.review(Path('candidate'), Path('live'))

    def test_migration_must_preserve_rows_and_tables(self):
        checksums = list(range(1, 118))
        before = {'versions': checksums[:116], 'tables': {'public_profiles': 'original'}}
        after = {'versions': checksums, 'tables': before['tables']}
        sql = photos.previous.search.directory.ranking.capacity
        for snapshot, schema_ok in [(dict(after, tables={}), b't'), (after, b'f')]:
            with (patch.object(photos, 'snapshot', return_value=snapshot),
                  patch.object(base, 'attachment_versions', return_value=checksums),
                  patch.object(base, 'verify_community_tables'),
                  patch.object(sql, 'psql', return_value=schema_ok),
                  self.assertRaises(RuntimeError)):
                photos.verify_migration(Path('candidate'), before)
        with (patch.object(photos, 'snapshot', return_value=after),
              patch.object(base, 'attachment_versions', return_value=checksums),
              patch.object(base, 'verify_community_tables') as tables,
              patch.object(sql, 'psql', return_value=b't')):
            photos.verify_migration(Path('candidate'), before)
        self.assertEqual(tables.call_args.args[0], photos.TABLES)
        self.assertIn("LIKE '%video/mp4%'", photos.SCHEMA_CHECK)
        self.assertIn("NOT LIKE '%video/mp4%'", photos.ABSENT)

    def test_transition_requires_its_own_approval_flag_before_touching_workers(self):
        with (patch.object(photos.previous.background, 'verify_current') as workers,
              self.assertRaisesRegex(RuntimeError, 'explicit --video-stickers approval')):
            photos.activate({'post_photos': True}, Path('work'), Path('candidate'), {})
        workers.assert_not_called()


if __name__ == '__main__':
    unittest.main()
