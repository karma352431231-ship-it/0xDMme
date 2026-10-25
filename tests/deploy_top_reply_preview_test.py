"""Top nested reply previews retain exact database, schema and runtime guards."""
from pathlib import Path
import subprocess
import sys
from unittest.mock import patch
import deploy_source_text_test as contracts
import deploy
import deploy_reviewed_code as reviewed_code

remote = contracts.remote
backups = contracts.backups


class TopReplyPreviewReviewTests(contracts.SourceTextReviewTests):
    before = reviewed_code.TOP_REPLY_PREVIEW_BEFORE
    reviewed = reviewed_code.TOP_REPLY_PREVIEW_REVIEWED
    review_modules = reviewed_code.TOP_REPLY_PREVIEW_MODULES

    def test_database_read_review_does_not_approve_runtime_changes(self):
        for name in ['package-lock.json', '.nvmrc']:
            with self.subTest(path=name):
                path = self.candidate / name
                original = path.read_bytes()
                path.write_text('unreviewed runtime')
                try:
                    with (patch.object(backups, 'git_export', side_effect=lambda sha: self.exports[sha]),
                          self.assertRaises(RuntimeError)):
                        remote.compatibility(self.candidate, self.live)
                finally:
                    path.write_bytes(original)

    def test_executor_keeps_proxy_installers_scoped_to_requested_operations(self):
        root = Path(__file__).resolve().parents[1]
        files = {'infra/staging/' + path.name: remote.digest(path)
                 for path in (root / 'infra/staging').glob('deploy_*.py')}
        for selection in [{}, {'message_sync': True}, {'group_fences': True},
                          {'request_limit': {}}, {'capacity': {}}]:
            with self.subTest(selection=selection):
                code = deploy.executor_code(dict(selection, files=files))
                safe = code.rsplit('print(json.dumps', 1)[0]
                for module, expected in [
                        ('deploy_capacity_proxy', 'capacity' in selection),
                        ('deploy_request_limit', 'capacity' in selection or 'request_limit' in selection)]:
                    safe += f'assert ({module!r} in sys.modules) is {expected!r}\n'
                subprocess.run([sys.executable, '-c', safe], check=True,
                               capture_output=True, timeout=10)
                self.assertLess(len(code.encode()), 64 * 1024)
