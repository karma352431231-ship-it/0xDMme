"""A candidate that would refuse its moderation approvals never reaches a unit stop."""
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import deploy_pipeline_test as fixtures

remote = fixtures.remote


class ModerationPreflightTests(unittest.TestCase):
    def unit(self, directory):
        files = Path(directory) / 'web.env'
        files.write_text('HASH_TALK_DATABASE_URL=postgresql://user:secret@127.0.0.1/db\n'
                         'HASH_TALK_SESSION_SECRET=private\n')
        moderation = Path(directory) / 'moderation.env'
        moderation.write_text('# comment\nHASH_TALK_MODERATION_ACCEPTED_PIPELINES="a,b"\n'
                              'HASH_TALK_MODERATION_ACCEPTED_NEXT_HASH=c\n')
        outputs = {
            'EnvironmentFiles': f'{files} (ignore_errors=no)\n{moderation} (ignore_errors=no)\n'
                                '/missing.env (ignore_errors=yes)\n',
            'Environment': 'HASH_TALK_MEDIA_FFMPEG=/opt/media/ffmpeg "HASH_TALK_MEDIA_FFPROBE=/opt/media/ff probe" '
                           'HASH_TALK_BACKGROUND_MODE=isolated',
        }
        return lambda args, **_: outputs[args[4]].encode()

    def test_environment_keeps_only_moderation_and_media_settings(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch.object(remote, 'run', side_effect=self.unit(directory)):
                values = remote.unit_moderation_environment()
        self.assertEqual(values, {
            'HASH_TALK_MODERATION_ACCEPTED_PIPELINES': 'a,b',
            'HASH_TALK_MODERATION_ACCEPTED_NEXT_HASH': 'c',
            'HASH_TALK_MEDIA_FFMPEG': '/opt/media/ffmpeg',
            'HASH_TALK_MEDIA_FFPROBE': '/opt/media/ff probe',
        })

    def test_candidate_check_receives_no_secrets(self):
        calls = []
        with tempfile.TemporaryDirectory() as directory:
            unit = self.unit(directory)
            def command(args, **options):
                if args[0] == 'systemctl':
                    return unit(args)
                calls.append((args, options))
                return b''
            with patch.object(remote, 'run', side_effect=command):
                remote.moderation_preflight(Path('/candidate'))
        [(args, options)] = calls
        self.assertEqual(args[0], '/usr/bin/node')
        self.assertEqual(args[-1], '/candidate')
        self.assertNotIn('HASH_TALK_DATABASE_URL', options['env'])
        self.assertNotIn('HASH_TALK_SESSION_SECRET', options['env'])
        self.assertEqual(options['env']['HASH_TALK_MODERATION_ACCEPTED_NEXT_HASH'], 'c')

    def test_refused_approval_stops_preparation_with_its_reason(self):
        with tempfile.TemporaryDirectory() as directory:
            unit = self.unit(directory)
            def command(args, **_):
                if args[0] == 'systemctl':
                    return unit(args)
                raise subprocess.CalledProcessError(3, args, output=b'Incomplete pipeline approvals.')
            with patch.object(remote, 'run', side_effect=command):
                with self.assertRaisesRegex(RuntimeError, 'Incomplete pipeline approvals'):
                    remote.moderation_preflight(Path('/candidate'))

    def test_unexpected_failure_reports_the_error_line_not_the_runtime_footer(self):
        stderr = (b'node:internal/modules/esm/resolve:257\n'
                  b"Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/candidate/src/server'\n"
                  b'    at finalizeResolution (node:internal)\n\nNode.js v24.18.1\n')
        with tempfile.TemporaryDirectory() as directory:
            unit = self.unit(directory)
            def command(args, **_):
                if args[0] == 'systemctl':
                    return unit(args)
                raise subprocess.CalledProcessError(1, args, output=b'', stderr=stderr)
            with patch.object(remote, 'run', side_effect=command):
                with self.assertRaisesRegex(RuntimeError, 'ERR_MODULE_NOT_FOUND'):
                    remote.moderation_preflight(Path('/candidate'))
