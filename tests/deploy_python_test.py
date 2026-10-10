"""Local interpreter selection; no Git, network or release operations."""

from contextlib import redirect_stdout
import io
import json
import os
from pathlib import Path
import runpy
import subprocess
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'infra/staging'))
import deploy_python as interpreter


class Reexecuted(BaseException):
    """Stand in for execv replacing the test process."""


class DeploymentPythonTests(unittest.TestCase):
    def test_python314_is_kept_without_relaunch(self):
        with (patch.object(interpreter.sys, 'version_info', (3, 14, 7)),
              patch.object(interpreter.subprocess, 'run') as probe,
              patch.object(interpreter.os, 'execv') as launch):
            interpreter.ensure_python314('infra/staging/deploy.py')
        probe.assert_not_called()
        launch.assert_not_called()

    def test_old_default_selects_verified314_and_keeps_cli_context(self):
        script = Path(__file__).resolve().parents[1] / 'infra/staging/deploy.py'
        cwd = os.getcwd()
        with (patch.object(interpreter.sys, 'version_info', (3, 9, 6)),
              patch.object(interpreter.sys, 'argv', [str(script), '--activate', '--request-limit']),
              patch.object(interpreter.shutil, 'which', return_value='/wrong/python3.14'),
              patch.object(interpreter, 'STANDARD_INTERPRETERS', ('/correct/python3.14',)),
              patch.object(interpreter.subprocess, 'run', side_effect=lambda args, **kwargs:
                  SimpleNamespace(returncode=0 if args[0] == '/correct/python3.14' else 1)),
              patch.object(interpreter.os, 'execv', side_effect=Reexecuted) as launch,
              self.assertRaises(Reexecuted)):
            interpreter.ensure_python314(str(script))
        launch.assert_called_once_with('/correct/python3.14',
            ['/correct/python3.14', str(script), '--activate', '--request-limit'])
        self.assertEqual(os.getcwd(), cwd)

    def test_unavailable_wrong_or_stalled_interpreters_fail_before_launch(self):
        failures = [SimpleNamespace(returncode=1), FileNotFoundError(),
                    subprocess.TimeoutExpired('python3.14', 3)]
        for failure in failures:
            with self.subTest(failure=type(failure).__name__):
                with (patch.object(interpreter.sys, 'version_info', (3, 9, 6)),
                      patch.object(interpreter.shutil, 'which', return_value='/candidate/python3.14'),
                      patch.object(interpreter, 'STANDARD_INTERPRETERS', ()),
                      patch.object(interpreter.subprocess, 'run') as probe,
                      patch.object(interpreter.os, 'execv') as launch):
                    if isinstance(failure, Exception):
                        probe.side_effect = failure
                    else:
                        probe.return_value = failure
                    with self.assertRaisesRegex(RuntimeError, 'Python 3.14.*No release operation'):
                        interpreter.ensure_python314('infra/staging/deploy.py')
                    self.assertEqual(probe.call_args.kwargs['timeout'], 3)
                    launch.assert_not_called()

    def test_cli_refuses_missing314_before_git_or_vps_access(self):
        script = Path(__file__).resolve().parents[1] / 'infra/staging/deploy.py'
        output = io.StringIO()
        with (patch.object(interpreter.sys, 'version_info', (3, 9, 6)),
              patch.object(interpreter.sys, 'argv', [str(script), '--activate']),
              patch.object(interpreter.shutil, 'which', return_value=None),
              patch.object(interpreter, 'STANDARD_INTERPRETERS', ()),
              patch.object(subprocess, 'run') as command,
              redirect_stdout(output), self.assertRaises(SystemExit) as stopped):
            runpy.run_path(str(script), run_name='__main__')
        self.assertEqual(stopped.exception.code, 1)
        command.assert_not_called()
        result = json.loads(output.getvalue())
        self.assertTrue(result['deployment_failed'])
        self.assertIn('Python 3.14', result['message'])


if __name__ == '__main__':
    unittest.main()
