"""Scope, preservation and rollback of the separately approved proxy adjustment."""

import hashlib
import json
from pathlib import Path
import shlex
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'infra/staging'))
import deploy_request_limit as limits
import deploy_remote as base
import deploy


class RequestLimitTests(unittest.TestCase):
    def proposal(self, path):
        old = limits.RATE + '\nserver {\n    ' + limits.BURST + '\n    limit_conn xdmme_connections 16;\n}'
        new = old
        for before, after in limits.REPLACEMENTS:
            new = new.replace(before, after)
        return {'path': str(path), 'old_content': old, 'new_content': new,
                'old_sha256': hashlib.sha256(old.encode()).hexdigest(),
                'new_sha256': hashlib.sha256(new.encode()).hexdigest()}

    def test_scope_rejects_other_paths_directives_hashes_and_duplicate_zones(self):
        proposal = self.proposal(limits.PROXY)
        limits.validate(proposal)
        for value in [dict(proposal, path='/etc/nginx/nginx.conf'),
                      dict(proposal, new_content=proposal['new_content'] + '\naccess_log on;'),
                      dict(proposal, new_sha256='0' * 64),
                      dict(proposal, old_content=proposal['old_content'] + '\n' + limits.RATE),
                      dict(proposal, new_content=proposal['new_content'].replace('30r/s', '300r/s'))]:
            with self.subTest(value=value), self.assertRaises(RuntimeError):
                limits.validate(value)

    def test_change_retains_backup_preserves_state_and_can_be_rechecked(self):
        with tempfile.TemporaryDirectory() as directory:
            work = Path(directory)
            path = work / 'own.conf'
            proposal = self.proposal(path)
            path.write_text(proposal['old_content'])
            def state():
                return {'files': {str(path): base.digest(path), 'unrelated': 'stable'},
                        'postgres': 'same-process'}
            with patch.object(limits, 'PROXY', path), patch.object(base, 'preservation') as preservation, \
                    patch.object(base, 'own_state', side_effect=state), \
                    patch.object(base, 'healthy'), patch.object(base, 'run') as run:
                config = {'request_limit': proposal, 'baseline': {'private': 'baseline'}}
                result = limits.change(config, work)
                self.assertEqual(path.read_text(), proposal['new_content'])
                self.assertEqual((work / 'request-limit-before.conf').read_text(), proposal['old_content'])
                self.assertTrue(result['preservation_checks_passed'])
                self.assertTrue(limits.change(config, work)['already_configured'])
                self.assertEqual(sum(c.args[0] == ['systemctl', 'reload', 'nginx'] for c in run.call_args_list), 1)
                self.assertGreaterEqual(preservation.call_count, 4)
                self.assertEqual((work / 'request-limit-before.conf').stat().st_mode & 0o777, 0o600)

    def test_failed_syntax_reload_or_verification_returns_only_own_file(self):
        for fail_at in [0, 1, 2]:
            with self.subTest(fail_at=fail_at), tempfile.TemporaryDirectory() as directory:
                work = Path(directory)
                path = work / 'own.conf'
                proposal = self.proposal(path)
                path.write_text(proposal['old_content'])
                def state():
                    return {'files': {str(path): base.digest(path)}, 'postgres': 'stable'}
                calls = 0
                def run(command):
                    nonlocal calls
                    self.assertIn(command, [['nginx', '-t'], ['systemctl', 'reload', 'nginx']])
                    calls += 1
                    if calls == fail_at + 1 and fail_at < 2:
                        raise RuntimeError('synthetic proxy failure')
                healthy = [RuntimeError('synthetic health failure'), None] if fail_at == 2 else [None]
                with patch.object(limits, 'PROXY', path), patch.object(base, 'preservation'), \
                        patch.object(base, 'own_state', side_effect=state), \
                        patch.object(base, 'healthy', side_effect=healthy), \
                        patch.object(base, 'run', side_effect=run):
                    with self.assertRaisesRegex(RuntimeError, 'rollback verified'):
                        limits.change({'request_limit': proposal, 'baseline': {}}, work)
                self.assertEqual(path.read_text(), proposal['old_content'])
                self.assertTrue(json.loads((work / 'request-limit-result.json').read_text())['rollback_verified'])

    def test_changed_config_symlink_and_unverified_attempt_are_refused(self):
        with tempfile.TemporaryDirectory() as directory:
            work = Path(directory)
            path = work / 'own.conf'
            proposal = self.proposal(path)
            path.write_text('unexpected')
            with patch.object(limits, 'PROXY', path), self.assertRaises(RuntimeError):
                limits.reviewed_path(proposal)
            path.unlink()
            actual = work / 'target'
            actual.write_text(proposal['old_content'])
            path.symlink_to(actual)
            with patch.object(limits, 'PROXY', path), self.assertRaises(RuntimeError):
                limits.reviewed_path(proposal)
            path.unlink()
            path.write_text(proposal['new_content'])
            with patch.object(limits, 'PROXY', path), patch.object(base, 'preservation'), \
                    patch.object(base, 'own_state', return_value={}), self.assertRaises(RuntimeError):
                limits.change({'request_limit': proposal, 'baseline': {}}, work)

    def test_only_explicit_proxy_action_can_write_own_configuration(self):
        files = {str(p.relative_to(Path(deploy.__file__).parent.parent.parent)): base.digest(p)
                 for p in Path(deploy.__file__).parent.glob('deploy*.py')}
        with tempfile.TemporaryDirectory() as directory:
            local = Path(directory)
            revision = 'a' * 40
            (local / revision).mkdir()
            config = {'commit': revision, 'files': files}
            result = SimpleNamespace(returncode=0, stdout=b'{"verified":true}', stderr=b'')
            with patch.object(deploy, 'LOCAL', local), patch.object(deploy.subprocess, 'run', return_value=result) as run:
                for action in ['check', 'activate', 'requests']:
                    deploy.remote(action, config, 'synthetic-target')
                    command = shlex.split(run.call_args.args[0][-1])
                    writable = next(x for x in command if x.startswith('ReadWritePaths='))
                    self.assertIn('/var/lib/0xdmme/data', writable)
                    self.assertEqual(str(limits.PROXY) in writable, action == 'requests')
                    self.assertEqual('TemporaryFileSystem=/var/log/nginx:rw' in command, action == 'requests')
                    self.assertIn('MemoryMax=192M', command)
                    self.assertIn('RuntimeMaxSec=240', command)


    def test_worker_validator_gets_bounded_private_temp_only_for_activation(self):
        files = {str(p.relative_to(Path(deploy.__file__).parent.parent.parent)): base.digest(p)
                 for p in Path(deploy.__file__).parent.glob('deploy*.py')}
        files['src/server/worker.ts'] = 'a' * 64
        with tempfile.TemporaryDirectory() as directory:
            local = Path(directory)
            revision = 'a' * 40
            (local / revision).mkdir()
            config = {'commit': revision, 'files': files}
            result = SimpleNamespace(returncode=0, stdout=b'{"verified":true}', stderr=b'')
            with patch.object(deploy, 'LOCAL', local), patch.object(deploy.subprocess, 'run', return_value=result) as run:
                for action in ['check', 'activate', 'requests']:
                    deploy.remote(action, config, 'synthetic-target')
                    command = shlex.split(run.call_args.args[0][-1])
                    self.assertEqual('TemporaryFileSystem=/tmp:rw,nosuid,nodev,noexec,size=16M' in command, action == 'activate')
                    self.assertEqual('Environment=TMPDIR=/tmp' in command, action == 'activate')
                    self.assertIn('ProtectSystem=strict', command)
                    self.assertIn('MemoryMax=192M', command)
                    self.assertIn('RuntimeMaxSec=240', command)


if __name__ == '__main__':
    unittest.main()
