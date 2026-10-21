"""Scoped worker layout action, publication gate, preservation and recovery."""
from contextlib import ExitStack
import json
from pathlib import Path
import shlex
import subprocess
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'infra/staging'))
import deploy
import deploy_worker_boot as boot
import deploy_worker_layout as layout
import deploy_worker_readiness as readiness
import deploy_background as background
import deploy_remote as base


class WorkerBootTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name).resolve()
        self.system, self.volume = self.root / 'system', self.root / 'volume'
        (self.system / 'multi-user.target.wants').mkdir(parents=True)
        self.volume.mkdir()
        self.config = dict(commit='a' * 40, baseline={}, files={})
        for unit in layout.UNITS:
            path = self.volume / unit
            path.write_text('reviewed ' + unit)
            (self.system / unit).symlink_to(path)
            (self.system / 'multi-user.target.wants' / unit).symlink_to(path)
            self.config['files']['infra/staging/' + unit] = base.digest(path)
        self.config['worker_boot'] = dict(commit=self.config['commit'], unit_sha256={unit: base.digest(self.volume / unit) for unit in layout.UNITS})
        self.work = self.root / 'worker-boot'
        stack = ExitStack()
        self.addCleanup(stack.close)
        for item in [patch.object(layout, 'SYSTEM', self.system), patch.object(layout, 'root_metadata'),
                     patch.object(layout.os, 'fchown'), patch.object(boot.os, 'geteuid', return_value=0),
                     patch.object(background, 'UNIT_ROOT', self.volume),
                     patch.object(background, 'verify_current', side_effect=lambda config: layout.detect(self.system, self.volume)),
                     patch.object(base, 'preservation'), patch.object(base, 'healthy'),
                     patch.object(base, 'own_state', return_value={'unchanged': True}),
                     patch.object(boot, 'other_services', return_value={'all': 'unchanged'}),
                     patch.object(readiness, 'status', return_value={'MainPID': '42'}),
                     patch.object(readiness, 'ready', return_value=True)]:
            stack.enter_context(item)
        self.command = stack.enter_context(patch.object(base, 'run', return_value=b''))

    def test_success_preserves_bytes_restarts_sequentially_and_repeat_is_read_only(self):
        result = boot.change(self.config, self.work)
        self.assertEqual(result['status'], 'configured')
        self.assertEqual(layout.detect(self.system, self.volume), 'root')
        expected = [['systemd-analyze', 'verify', *(str(self.system / unit) for unit in layout.UNITS)],
                    ['systemctl', 'daemon-reload'],
                    *[['systemctl', 'restart', unit] for unit in layout.UNITS]]
        self.assertEqual([call.args[0] for call in self.command.call_args_list], expected)
        self.assertEqual(json.loads((self.work / 'before.json').read_text())['paths'][layout.UNITS[0]]['definition'], str(self.volume / layout.UNITS[0]))
        self.command.reset_mock()
        self.assertTrue(boot.change(self.config, self.work)['already_configured'])
        self.command.assert_not_called()

    def test_second_worker_failure_restores_only_six_links_and_retains_failure_receipt(self):
        def command(args, **options):
            if args == ['systemctl', 'restart', layout.UNITS[1]]:
                raise subprocess.CalledProcessError(1, args)
            return b''
        self.command.side_effect = command
        with self.assertRaisesRegex(RuntimeError, 'rollback verified'):
            boot.change(self.config, self.work)
        self.assertEqual(layout.detect(self.system, self.volume), 'volume')
        receipt = json.loads((self.work / 'result.json').read_text())
        self.assertTrue(receipt['rollback_verified'])
        commands = [call.args[0] for call in self.command.call_args_list]
        self.assertNotIn(['systemctl', 'restart', layout.UNITS[2]], commands)
        self.assertEqual(commands.count(['systemctl', 'daemon-reload']), 2)
        with self.assertRaisesRegex(RuntimeError, 'Previous worker-boot attempt'):
            boot.change(self.config, self.work)

    def test_failed_rollback_retains_error_type_and_refuses_automatic_retry(self):
        with patch.object(layout, 'install', side_effect=OSError('private detail')), patch.object(layout, 'restore', side_effect=RuntimeError('private edit')):
            with self.assertRaisesRegex(RuntimeError, 'inspect private evidence'):
                boot.change(self.config, self.work)
        receipt = json.loads((self.work / 'result.json').read_text())
        self.assertEqual(receipt['rollback_error_type'], 'RuntimeError')
        self.assertFalse(receipt['rollback_verified'])
        self.assertNotIn('private', json.dumps(receipt))

    def test_unready_or_changed_review_fails_before_writing_or_restarting(self):
        with patch.object(readiness, 'ready', return_value=False), self.assertRaisesRegex(RuntimeError, 'not ready'):
            boot.change(self.config, self.work)
        self.assertFalse(self.work.exists())
        self.config['worker_boot']['unit_sha256'][layout.UNITS[0]] = 'b' * 64
        with self.assertRaisesRegex(RuntimeError, 'bytes or scope'):
            boot.change(self.config, self.work)
        self.command.assert_not_called()

    def test_other_worker_change_aborts_sequential_restart(self):
        with patch.object(readiness, 'status', side_effect=[{'MainPID': '42'}, {'MainPID': '43'}, {'MainPID': '999'}, {'MainPID': '43'}]):
            with self.assertRaisesRegex(RuntimeError, 'Untouched worker changed'):
                boot.restart_one('ranking')
        self.command.assert_called_once_with(['systemctl', 'restart', layout.UNITS[0]], timeout=15)

    def test_missing_lease_times_out_and_recovery_starts_only_unready_role(self):
        clock = {'seconds': 0}
        def sleep(seconds):
            clock['seconds'] += seconds
        def ready(roles=layout.ROLES):
            return roles != ('ranking',)
        with patch.object(readiness, 'ready', side_effect=ready), patch.object(boot.time, 'monotonic', side_effect=lambda: clock['seconds']), patch.object(boot.time, 'sleep', side_effect=sleep):
            with self.assertRaisesRegex(RuntimeError, 'did not regain'):
                boot.restart_one('ranking')
            self.assertEqual(clock['seconds'], 30)
            self.command.reset_mock()
            boot.return_workers()
            self.command.assert_called_once_with(['systemctl', 'start', layout.UNITS[0]], timeout=15)

    def test_missing_review_cannot_create_operational_evidence_or_exchange_paths(self):
        with patch.object(base, 'DATA', self.root):
            with self.assertRaisesRegex(RuntimeError, 'Exact private worker-boot review'):
                boot.published(dict(self.config, worker_boot=None), self.root / 'deployment')
        self.assertFalse((self.root / '.local').exists())
        self.command.assert_not_called()

    def test_exact_publication_and_active_files_are_required_before_layout_action(self):
        publication = self.root / 'deployment'
        publication.mkdir()
        marker = publication / 'result.json'
        with patch.object(base, 'DATA', self.root), patch.object(boot, 'change') as change:
            for state in [None, {'status': 'maintenance', 'commit': self.config['commit']}, {'status': 'published', 'commit': 'b' * 40}]:
                if state is not None:
                    marker.write_text(json.dumps(state))
                with self.assertRaisesRegex(RuntimeError, 'published|exact published'):
                    boot.published(self.config, publication)
            marker.write_text(json.dumps(dict(status='published', commit=self.config['commit'])))
            with self.assertRaisesRegex(RuntimeError, 'Active release differs'):
                boot.published(self.config, publication)
            change.assert_not_called()
            for unit in layout.UNITS:
                path = self.root / 'release/infra/staging' / unit
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes((self.volume / unit).read_bytes())
            boot.published(self.config, publication)
            change.assert_called_once_with(self.config, self.root / '.local' / ('worker-boot-' + self.config['commit']))

    def test_unreceipted_root_layout_and_interrupted_attempt_require_review(self):
        layout.install(self.system, self.volume, layout.snapshot(self.system, self.volume))
        with self.assertRaisesRegex(RuntimeError, 'no verified receipt'):
            boot.change(self.config, self.work)
        self.command.assert_not_called()

    def test_generic_preflight_refuses_workers_before_any_maintenance(self):
        (self.root / 'release').mkdir()
        (self.root / 'background-units').mkdir()
        config = dict(self.config, branch='codex/test')
        self.command.side_effect = [str(self.root).encode(), self.config['commit'].encode()]
        with patch.object(base, 'DATA', self.root), patch.object(base, 'validate'), patch.object(readiness, 'ready', return_value=False):
            with self.assertRaisesRegex(RuntimeError, 'refusing maintenance'):
                base.preflight(config)
        self.assertEqual([call.args[0][0] for call in self.command.call_args_list], ['findmnt', 'git'])

    def test_private_review_is_exact_bounded_ignored_and_not_a_symlink(self):
        directory = self.root / '.local'
        directory.mkdir()
        path = directory / 'VPS_WORKER_BOOT_REVIEW.json'
        path.write_text(json.dumps(self.config['worker_boot']))
        path.chmod(0o600)
        config = dict(self.config)
        with patch.object(boot.subprocess, 'run') as command:
            boot.configure(config, self.root)
            command.assert_called_once()
            path.chmod(0o644)
            with self.assertRaisesRegex(RuntimeError, 'missing or unsafe'):
                boot.configure(config, self.root)
            path.chmod(0o600)
            path.write_text('x' * 4097)
            with self.assertRaisesRegex(RuntimeError, 'missing or unsafe'):
                boot.configure(config, self.root)


class WorkerBootTransportTests(unittest.TestCase):
    def test_only_explicit_layout_action_can_write_system_unit_directory(self):
        with tempfile.TemporaryDirectory() as directory:
            local = Path(directory)
            config = dict(commit='a' * 40, files={'src/server/worker.ts': 'b' * 64})
            (local / config['commit']).mkdir()
            for action in ['check', 'receive', 'activate', 'worker-boot']:
                with patch.object(deploy, 'LOCAL', local), patch.object(deploy, 'executor_code', return_value='print(1)'), patch.object(deploy.subprocess, 'run', return_value=SimpleNamespace(stdout=b'{"ok":true}', stderr=b'', returncode=0)) as command:
                    deploy.remote(action, config, 'synthetic-target')
                arguments = shlex.split(command.call_args.args[0][-1])
                writable = next(value for value in arguments if value.startswith('ReadWritePaths='))
                self.assertEqual('/etc/systemd/system' in writable.split(), action == 'worker-boot')
                self.assertIn('ProtectSystem=strict', arguments)
                self.assertIn('RuntimeMaxSec=240', arguments)
                self.assertIn('MemorySwapMax=0', arguments)
                self.assertEqual('TemporaryFileSystem=/tmp:rw,nosuid,nodev,noexec,size=16M' in arguments, action in ['activate', 'worker-boot'])

    def test_check_and_failed_publication_never_dispatch_layout_action(self):
        with tempfile.TemporaryDirectory() as directory:
            archive = Path(directory) / 'build.tar.gz'
            archive.write_bytes(b'synthetic')
            config = dict(commit='a' * 40, files={})
            stack = ExitStack()
            with stack:
                for target in [patch.object(deploy, 'shared_private_workspace'),
                               patch.object(deploy, 'repository', return_value=(config['commit'], 'codex/test')),
                               patch.object(deploy, 'ci', return_value={}),
                               patch.object(deploy, 'prepare', return_value=(config, archive)),
                               patch.object(deploy, 'private_inputs', return_value=('synthetic-target', {})),
                               patch.object(deploy.worker_boot, 'configure'),
                               patch.object(deploy, 'run', return_value=config['commit'].encode()),
                               patch('builtins.print')]:
                    stack.enter_context(target)
                with patch.object(sys, 'argv', ['deploy.py', '--check', '--worker-boot']), patch.object(deploy, 'remote', return_value={'already_active': True}) as remote:
                    deploy.main()
                    self.assertEqual([call.args[0] for call in remote.call_args_list], ['check'])
                with patch.object(sys, 'argv', ['deploy.py', '--activate', '--worker-boot']), patch.object(deploy, 'remote', side_effect=[{}, {}, RuntimeError('publication failed')]) as remote:
                    with self.assertRaisesRegex(RuntimeError, 'publication failed'):
                        deploy.main()
                    self.assertEqual([call.args[0] for call in remote.call_args_list], ['check', 'receive', 'activate'])

    def test_actual_executor_modules_load_and_transport_stays_within_existing_budgets(self):
        files = {str(path.relative_to(deploy.ROOT)): base.digest(path) for path in (deploy.ROOT / 'infra/staging').glob('deploy_*.py')}
        code = deploy.executor_code({'files': files, 'worker_boot': {'reviewed': True}})
        self.assertNotIn('%', code)
        self.assertNotIn('$', code)
        safe = code.rsplit('print(json.dumps', 1)[0] + 'assert callable(sys.modules["deploy_worker_boot"].published)'
        subprocess.run([sys.executable, '-c', safe], capture_output=True, check=True, timeout=10)
        with tempfile.TemporaryDirectory() as directory:
            config = dict(commit='a' * 40, files=files, worker_boot={'reviewed': True})
            local = Path(directory)
            (local / config['commit']).mkdir()
            with patch.object(deploy, 'LOCAL', local), patch.object(deploy.subprocess, 'run', return_value=SimpleNamespace(stdout=b'{"ok":true}', stderr=b'', returncode=0)) as command:
                deploy.remote('worker-boot', config, 'synthetic-target')
            self.assertLessEqual(len(command.call_args.args[0][-1].encode()), 64 * 1024)


if __name__ == '__main__':
    unittest.main()
