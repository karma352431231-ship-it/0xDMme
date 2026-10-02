"""Release guards/rollback in temporary directories; no SSH or real restart."""

import io
import json
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'infra/staging'))
import deploy
import deploy_remote as remote


def manifest():
    return {'commit': 'a' * 40, 'branch': 'codex/example',
            'files': {'dist/web/app-' + 'b' * 16 + '.js': 'c' * 64},
            'script': '/app-' + 'b' * 16 + '.js',
            'archive_bytes': 10, 'archive_sha256': 'd' * 64}


class DeploymentTests(unittest.TestCase):
    def test_manifest_rejects_escape_and_unbounded_input(self):
        for name in ['/etc/passwd', 'src/../../etc/passwd', '.local/access', 'data/history']:
            value = manifest()
            value['files'][name] = 'a' * 64
            with self.assertRaises(RuntimeError):
                remote.validate(value)
        value = manifest()
        value['archive_bytes'] = remote.MAX_ARCHIVE + 1
        with self.assertRaises(RuntimeError):
            remote.validate(value)

    def test_archive_rejects_traversal_links_and_devices_before_writing(self):
        for name, kind in [('dist/../../outside', tarfile.REGTYPE),
                           ('dist/link', tarfile.SYMTYPE),
                           ('dist/link', tarfile.LNKTYPE),
                           ('dist/device', tarfile.CHRTYPE)]:
            buffer = io.BytesIO()
            with tarfile.open(fileobj=buffer, mode='w') as archive:
                item = tarfile.TarInfo(name)
                item.type = kind
                item.linkname = '../../outside'
                archive.addfile(item)
            buffer.seek(0)
            with tempfile.TemporaryDirectory() as directory:
                with tarfile.open(fileobj=buffer) as archive:
                    with self.assertRaises(RuntimeError):
                        remote.extract(archive, Path(directory), ['dist'])
                self.assertEqual(list(Path(directory).iterdir()), [])

    def test_archive_duplicate_member_is_rejected(self):
        buffer = io.BytesIO()
        with tarfile.open(fileobj=buffer, mode='w') as archive:
            archive.addfile(tarfile.TarInfo('dist/file'))
            archive.addfile(tarfile.TarInfo('dist/file'))
        buffer.seek(0)
        with tempfile.TemporaryDirectory() as directory:
            with tarfile.open(fileobj=buffer) as archive:
                with self.assertRaises(RuntimeError):
                    remote.extract(archive, Path(directory), ['dist'])

    def ci_run(self, **changes):
        return dict(id=1, head_sha='a' * 40, head_branch='codex/example', event='push',
                    path='.github/workflows/check.yml', status='completed', conclusion='success',
                    head_repository={'full_name': 'karma352431231-ship-it/0xDMme'},
                    html_url='https://github.com/example/run', **changes)

    def test_ci_requires_latest_exact_revision_branch_workflow_and_repository(self):
        valid = self.ci_run()
        self.assertEqual(deploy.require_ci({'workflow_runs': [valid]}, 'a' * 40,
                                          'codex/example'), valid['html_url'])
        for field, value in [('head_sha', 'b' * 40), ('head_branch', 'main'),
                             ('event', 'pull_request'), ('path', 'unrelated.yml'),
                             ('status', 'in_progress'), ('conclusion', 'failure'),
                             ('head_repository', {'full_name': 'someone/else'})]:
            bad = dict(valid, id=2)
            bad[field] = value
            with self.assertRaises(RuntimeError):
                deploy.require_ci({'workflow_runs': [valid, bad]}, 'a' * 40, 'codex/example')

    def runtime(self, path):
        (path / 'src/server/database/migrations').mkdir(parents=True)
        (path / 'src/server/database/index.ts').write_text('migration executor')
        (path / 'src/server/database/migrations/001.sql').write_text('existing SQL')
        (path / 'package-lock.json').write_text('same dependency lock')
        (path / '.nvmrc').write_text('24.14.0')
        (path / 'package.json').write_text(json.dumps({'dependencies': {'pg': '8.23.1'},
                                                      'engines': {'node': '>=24.14.0 <25'}}))

    def test_migrations_and_dependencies_require_separate_review(self):
        for changed in ['src/server/database/migrations/001.sql', 'src/server/database/index.ts',
                        'package-lock.json', '.nvmrc']:
            with tempfile.TemporaryDirectory() as directory:
                old, new = Path(directory) / 'old', Path(directory) / 'new'
                self.runtime(old)
                self.runtime(new)
                (new / changed).write_text('changed')
                with self.assertRaises(RuntimeError):
                    remote.compatibility(new, old)

    def test_scripts_change_does_not_install_dependencies(self):
        with tempfile.TemporaryDirectory() as directory:
            old, new = Path(directory) / 'old', Path(directory) / 'new'
            self.runtime(old)
            self.runtime(new)
            package = json.loads((new / 'package.json').read_text())
            package['scripts'] = {'deploy:staging': 'python3 deployment'}
            (new / 'package.json').write_text(json.dumps(package))
            with patch.object(remote, 'run', return_value=b'v24.14.0') as command:
                remote.compatibility(new, old)
            self.assertEqual(command.call_args.args[0], ['/usr/bin/node', '--version'])

    def reviewed_probe_locks(self):
        # Reconstruct the previous lock from the current reviewed npm lock. The
        # exact digest asserts no other change is hidden by this reconstruction;
        # CI's shallow checkout does not need historical Git objects or fixtures.
        current = (deploy.ROOT / 'package-lock.json').read_bytes()
        previous = json.loads(current)
        previous['packages']['']['devDependencies'].pop('libsodium-wrappers')
        for name in ['libsodium', 'libsodium-wrappers']:
            previous['packages'].pop('node_modules/' + name)
        return ((json.dumps(previous, indent=2, ensure_ascii=False) + '\n').encode(), current)

    def test_reviewed_probe_lock_transition_and_reverse_reuse_runtime(self):
        before, after = self.reviewed_probe_locks()
        self.assertEqual({remote.hashlib.sha256(blob).hexdigest() for blob in [before, after]},
                         set(remote.PHANTOM_PROBE_LOCKFILES))
        for old_bytes, new_bytes in [(before, after), (after, before)]:
            with tempfile.TemporaryDirectory() as directory:
                old, new = Path(directory) / 'old', Path(directory) / 'new'
                self.runtime(old)
                self.runtime(new)
                (old / 'package-lock.json').write_bytes(old_bytes)
                (new / 'package-lock.json').write_bytes(new_bytes)
                with patch.object(remote, 'run', return_value=b'v24.14.0') as command:
                    remote.compatibility(new, old)
                command.assert_called_once_with(['/usr/bin/node', '--version'])

    def test_probe_exception_rejects_unreviewed_dev_and_runtime_locks(self):
        before, after = self.reviewed_probe_locks()
        for entry in ['node_modules/libsodium', 'node_modules/pg']:
            changed = json.loads(after)
            changed['packages'][entry]['version'] = 'unreviewed'
            with tempfile.TemporaryDirectory() as directory:
                old, new = Path(directory) / 'old', Path(directory) / 'new'
                self.runtime(old)
                self.runtime(new)
                (old / 'package-lock.json').write_bytes(before)
                (new / 'package-lock.json').write_text(json.dumps(changed))
                with patch.object(remote, 'run') as command:
                    with self.assertRaises(RuntimeError):
                        remote.compatibility(new, old)
                command.assert_not_called()

    def test_probe_exception_keeps_database_node_and_runtime_contract_guards(self):
        before, after = self.reviewed_probe_locks()
        for changed in ['src/server/database/index.ts', '.nvmrc', 'package.json']:
            with tempfile.TemporaryDirectory() as directory:
                old, new = Path(directory) / 'old', Path(directory) / 'new'
                self.runtime(old)
                self.runtime(new)
                (old / 'package-lock.json').write_bytes(before)
                (new / 'package-lock.json').write_bytes(after)
                if changed == 'package.json':
                    package = json.loads((new / changed).read_text())
                    package['dependencies']['pg'] = 'unreviewed'
                    (new / changed).write_text(json.dumps(package))
                else:
                    (new / changed).write_text('unreviewed')
                with patch.object(remote, 'run') as command:
                    with self.assertRaises(RuntimeError):
                        remote.compatibility(new, old)
                command.assert_not_called()

    def test_installed_node_uses_approved_range_and_never_updates_system(self):
        with tempfile.TemporaryDirectory() as directory:
            old, new = Path(directory) / 'old', Path(directory) / 'new'
            self.runtime(old)
            self.runtime(new)
            for version in [b'v24.14.0', b'v24.18.1']:
                with patch.object(remote, 'run', return_value=version) as command:
                    remote.compatibility(new, old)
                command.assert_called_once_with(['/usr/bin/node', '--version'])
            for version in [b'v24.13.9', b'v25.0.0', b'v24.18.1-preview', b'unverified']:
                with patch.object(remote, 'run', return_value=version):
                    with self.assertRaises(RuntimeError):
                        remote.compatibility(new, old)

    def exchange_fixture(self, directory):
        base = Path(directory)
        (base / 'release').mkdir()
        (base / 'release/version').write_text('old')
        candidate = base / 'candidate'
        candidate.mkdir()
        (candidate / 'version').write_text('new')
        sentinel = base / 'other-project'
        sentinel.write_text('preserve this')
        return base, candidate, base / 'previous', sentinel

    def test_success_restarts_only_own_unit_and_keeps_previous(self):
        with tempfile.TemporaryDirectory() as directory:
            base, candidate, previous, sentinel = self.exchange_fixture(directory)
            with patch.object(remote, 'DATA', base), patch.object(remote, 'run') as command:
                remote.exchange(candidate, previous, lambda: None)
            command.assert_called_once_with(['systemctl', 'restart', '0xdmme-test.service'])
            self.assertEqual((base / 'release/version').read_text(), 'new')
            self.assertEqual((previous / 'version').read_text(), 'old')
            self.assertEqual(sentinel.read_text(), 'preserve this')

    def test_failed_health_or_preservation_restores_files_and_own_service(self):
        with tempfile.TemporaryDirectory() as directory:
            base, candidate, previous, sentinel = self.exchange_fixture(directory)
            def fail():
                raise RuntimeError('health/preservation failure')
            with (patch.object(remote, 'DATA', base), patch.object(remote, 'run') as command,
                  patch.object(remote, 'wait_ready') as ready):
                with self.assertRaises(remote.ActivationFailed) as error:
                    remote.exchange(candidate, previous, fail)
            self.assertTrue(error.exception.rollback_verified)
            self.assertEqual(command.call_count, 2)
            self.assertTrue(all(c.args[0] == ['systemctl', 'restart', '0xdmme-test.service']
                                for c in command.call_args_list))
            ready.assert_called_once()
            self.assertEqual((base / 'release/version').read_text(), 'old')
            self.assertEqual(sentinel.read_text(), 'preserve this')

    def test_failed_rollback_is_never_reported_as_verified(self):
        def fail():
            raise RuntimeError('verification failed')
        with tempfile.TemporaryDirectory() as directory:
            base, candidate, previous, _ = self.exchange_fixture(directory)
            with patch.object(remote, 'DATA', base), patch.object(remote, 'run'), \
                    patch.object(remote, 'wait_ready', side_effect=RuntimeError('not ready')):
                with self.assertRaises(remote.ActivationFailed) as error:
                    remote.exchange(candidate, previous, fail)
            self.assertFalse(error.exception.rollback_verified)

    def test_preflight_failure_never_prepares_or_restarts(self):
        with patch.object(remote, 'preflight', side_effect=RuntimeError('existing project changed')), \
                patch.object(remote, 'prepare') as prepare, patch.object(remote, 'exchange') as exchange:
            with self.assertRaises(RuntimeError):
                remote.activate(manifest(), Path('/unused'))
        prepare.assert_not_called()
        exchange.assert_not_called()

    def test_interrupted_attempt_is_not_retried(self):
        with tempfile.TemporaryDirectory() as directory:
            work = Path(directory)
            (work / 'result.json').write_text('{"status":"activating"}')
            with patch.object(remote, 'preflight', return_value={}), patch.object(remote, 'prepare') as prepare:
                with self.assertRaises(RuntimeError):
                    remote.activate(manifest(), work)
            prepare.assert_not_called()

    def test_pruning_keeps_current_rollback_and_leaves_unmanaged_directories(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            current = base / ('deployment-' + 'a' * 40)
            current.mkdir()
            older = base / ('deployment-' + 'b' * 40)
            older.mkdir()
            (older / 'build.tar.gz').write_bytes(b'old artifact')
            (older / 'result.json').write_text(json.dumps({'status': 'published', 'commit': 'b' * 40}))
            (older / 'previous').mkdir()
            (older / 'previous/package.json').write_text('{}')
            sentinel = base / 'other-project'
            sentinel.mkdir()
            (sentinel / 'data').write_text('preserved')
            interrupted = base / ('deployment-' + 'c' * 40)
            interrupted.mkdir()
            (interrupted / 'result.json').write_text('{"status":"activating"}')
            with patch.object(remote, 'DATA', base):
                remote.prune_completed(current)
            self.assertTrue(current.is_dir())
            self.assertFalse(older.exists())
            self.assertEqual((sentinel / 'data').read_text(), 'preserved')
            self.assertTrue(interrupted.is_dir())

    def test_real_git_build_contains_vendor_sources_and_excludes_private_files(self):
        revision = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=deploy.ROOT, text=True).strip()
        with tempfile.TemporaryDirectory() as directory, patch.object(deploy, 'LOCAL', Path(directory)):
            value, archive_path = deploy.prepare(revision, 'codex/test')
            remote.validate(value)
            with tarfile.open(archive_path) as archive:
                names = archive.getnames()
                self.assertTrue(all(n == 'dist' or n.startswith('dist/') for n in names))
                source = next(n for n in names if '/source-' in n and n.endswith('.tar.gz'))
                with tarfile.open(fileobj=io.BytesIO(archive.extractfile(source).read())) as corresponding:
                    entries = corresponding.getnames()
                    self.assertTrue(any(n.startswith('node_modules/@scure/base/') for n in entries))
                    self.assertTrue(any(n.startswith('node_modules/@wallet-standard/app/') for n in entries))
                    self.assertFalse(any(n.startswith(('.local/', 'src/server/', '.git/')) for n in entries))

    def test_already_active_version_does_not_restart_or_upload(self):
        value = manifest()
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            path = base / 'release/dist/web' / value['script'][1:]
            path.parent.mkdir(parents=True)
            path.write_text('current public code')
            value['files']['dist/web' + value['script']] = remote.digest(path)
            work = base / ('deployment-' + value['commit'])
            work.mkdir()
            (work / 'result.json').write_text(json.dumps({'status': 'published', 'commit': value['commit']}))
            stdin = SimpleNamespace(buffer=io.BytesIO(json.dumps(value).encode()))
            with (patch.object(remote, 'DATA', base), patch.object(remote, 'preflight'),
                  patch.object(remote, 'healthy') as healthy, patch.object(remote, 'run') as command,
                  patch.object(remote.sys, 'stdin', stdin), patch.object(remote.sys, 'argv', ['code', 'check'])):
                result = remote.main()
            self.assertTrue(result['already_active'])
            healthy.assert_called_once_with(value['files'])
            command.assert_not_called()

    def test_modified_executor_is_rejected_before_ssh(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            script = root / 'infra/staging/deploy_remote.py'
            script.parent.mkdir(parents=True)
            script.write_text('modified executor')
            value = manifest()
            value['files']['infra/staging/deploy_remote.py'] = 'a' * 64
            with patch.object(deploy, 'ROOT', root), patch.object(deploy.subprocess, 'run') as command:
                with self.assertRaises(RuntimeError):
                    deploy.remote('check', value, 'root@example.test')
            command.assert_not_called()

    def test_local_artifact_budget_fails_before_exporting_or_building(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            for number in range(16):
                (base / f'{number:040x}').mkdir()
            with patch.object(deploy, 'LOCAL', base), patch.object(deploy, 'run') as command:
                with self.assertRaises(RuntimeError):
                    deploy.prepare('f' * 40, 'codex/test')
            command.assert_not_called()
            self.assertFalse((base / ('f' * 40)).exists())


if __name__ == '__main__':
    unittest.main()
