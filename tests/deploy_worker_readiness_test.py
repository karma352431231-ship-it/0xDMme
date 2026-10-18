"""Worker readiness boundaries without real processes, credentials or SQL."""
import json
from pathlib import Path
import subprocess
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'infra/staging'))
import deploy_worker_readiness as readiness

LOADED = dict(LoadState='loaded', ActiveState='active', SubState='running', MainPID='42')
COUNTS = dict(ranking=1, content=1, public=1)
URL = 'postgresql://hash_talk_stage:synthetic%2Donly@127.0.0.1:45433/hash_talk_stage'


class WorkerReadinessTests(unittest.TestCase):
    def test_loaded_running_pid_and_each_role_lease_are_required(self):
        with patch.object(readiness, 'status', return_value=LOADED), patch.object(readiness, 'lease_counts', return_value=COUNTS) as counts:
            self.assertTrue(readiness.ready())
            for values in [dict(ranking=2, content=1, public=0), dict(ranking=1, content=0, public=1), None]:
                counts.return_value = values
                self.assertFalse(readiness.ready())
            counts.return_value = dict(ranking=0, content=1, public=1)
            self.assertTrue(readiness.ready(('content', 'public')))
        for values in [dict(LOADED, LoadState='not-found'), dict(LOADED, ActiveState='activating'),
                       dict(LOADED, SubState='dead'), dict(LOADED, MainPID='0')]:
            with self.subTest(values=values), patch.object(readiness, 'status', return_value=values), patch.object(readiness, 'lease_counts') as counts:
                self.assertFalse(readiness.ready())
                counts.assert_not_called()
        for roles in [(), ('content', 'content'), ('unreviewed',)]:
            with self.assertRaises(RuntimeError):
                readiness.ready(roles)

    def test_real_nul_environment_parsing_and_secrets_stay_out_of_argv(self):
        raw = b'OTHER=opaque\xff\0HASH_TALK_DATABASE_URL=' + URL.encode() + b'\0AFTER=unused\0'
        with patch.object(Path, 'read_bytes', return_value=raw):
            environment = readiness.lease_environment(42)
        self.assertEqual(environment['PGPASSWORD'], 'synthetic-only')
        self.assertEqual(environment['PGPORT'], '45433')
        self.assertIn('default_transaction_read_only=on', environment['PGOPTIONS'])
        with patch.object(readiness.base, 'run', return_value=b'42\n'), patch.object(readiness, 'lease_environment', return_value=environment), patch.object(readiness.subprocess, 'run', return_value=SimpleNamespace(stdout=json.dumps(COUNTS).encode())) as command:
            self.assertEqual(readiness.lease_counts(), COUNTS)
        self.assertNotIn('synthetic', ' '.join(command.call_args.args[0]))
        self.assertEqual(command.call_args.kwargs['timeout'], 3)
        self.assertIn('--net', command.call_args.args[0])
        self.assertEqual(command.call_args.kwargs['env']['PGCONNECT_TIMEOUT'], '2')

    def test_database_boundary_and_missing_or_duplicate_url_are_refused(self):
        for raw in [b'OTHER=unused\0', b'HASH_TALK_DATABASE_URL=' + URL.encode() + b'\0HASH_TALK_DATABASE_URL=' + URL.encode(),
                    b'HASH_TALK_DATABASE_URL=' + URL.replace('127.0.0.1', 'remote.invalid').encode(),
                    b'HASH_TALK_DATABASE_URL=' + URL.replace('postgresql:', 'http:').encode(),
                    b'HASH_TALK_DATABASE_URL=' + URL.replace('45433', '5432').encode(),
                    b'HASH_TALK_DATABASE_URL=' + URL.replace('/hash_talk_stage', '/other').encode()]:
            with self.subTest(raw=raw), patch.object(Path, 'read_bytes', return_value=raw), self.assertRaises(RuntimeError):
                readiness.lease_environment(42)

    def test_connection_loss_is_unready_but_query_error_is_explicit_and_sanitized(self):
        for error in [subprocess.TimeoutExpired('psql', 3), FileNotFoundError(),
                      subprocess.CalledProcessError(2, ['psql'], stderr=b'private')]:
            with patch.object(readiness.base, 'run', return_value=b'42'), patch.object(readiness, 'lease_environment', return_value={}), patch.object(readiness.subprocess, 'run', side_effect=error):
                self.assertIsNone(readiness.lease_counts())
        with patch.object(readiness.base, 'run', return_value=b'42'), patch.object(readiness, 'lease_environment', return_value={}), patch.object(readiness.subprocess, 'run', side_effect=subprocess.CalledProcessError(3, ['psql'], stderr=b'private')):
            with self.assertRaisesRegex(RuntimeError, '^Own worker SQL readiness failed.$'):
                readiness.lease_counts()

    def test_malformed_or_incomplete_lease_counts_are_never_ready(self):
        for value in [[], dict(COUNTS, ranking=True), dict(COUNTS, content=-1), dict(ranking=1), dict(COUNTS, extra=1)]:
            with self.subTest(value=value), patch.object(readiness.base, 'run', return_value=b'42'), patch.object(readiness, 'lease_environment', return_value={}), patch.object(readiness.subprocess, 'run', return_value=SimpleNamespace(stdout=json.dumps(value).encode())), self.assertRaises(RuntimeError):
                readiness.lease_counts()


if __name__ == '__main__':
    unittest.main()
