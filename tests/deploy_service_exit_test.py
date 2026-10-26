"""Service-manager exit classification and private bounded output."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('record_service_exit', Path(__file__).resolve().parents[1] / 'infra/staging/record_service_exit.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ServiceExitTests(unittest.TestCase):
    def test_exit_evidence_retains_only_fixed_fields_and_replaces_one_private_file(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary).resolve() / 'diagnostics'
            for result in ['oom-kill', 'timeout', 'success', 'signal', 'PRIVATE_RESULT']:
                module.record(dict(SERVICE_RESULT=result, EXIT_CODE='killed', EXIT_STATUS='KILL',
                                   PGPASSWORD='PRIVATE_PASSWORD', EXTRA='PRIVATE_VALUE'), directory)
                path = directory / 'service-exit.json'
                value = json.loads(path.read_text())
                self.assertEqual(value['result'], result if result != 'PRIVATE_RESULT' else 'unknown')
                self.assertEqual(value['exitStatus'], 'KILL')
                self.assertNotIn('PRIVATE_', path.read_text())
                self.assertEqual(path.stat().st_mode & 0o777, 0o600)
                self.assertEqual(list(directory.iterdir()), [path])

    def test_exit_record_never_follows_a_temporary_symlink(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary).resolve()
            target = directory / 'unrelated'
            target.write_text('preserved')
            (directory / 'service-exit.json.pending').symlink_to(target)
            with self.assertRaises(OSError):
                module.record({}, directory)
            self.assertEqual(target.read_text(), 'preserved')
