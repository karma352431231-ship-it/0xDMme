"""Release guards/rollback in temporary directories; no SSH or real restart."""

import io
import hashlib
import json
import os
import shutil
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile
from contextlib import ExitStack
from types import SimpleNamespace
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'infra/staging'))
import deploy
import deploy_remote as remote
import deploy_blocks45 as backups
import deploy_runtime as runtime


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
        current_lock = json.loads((deploy.ROOT / 'package-lock.json').read_bytes())
        # QR belongs to a later local feature, outside this historical exception.
        # Its removal reconstructs the old exact lock; pinned hashes still guard
        # against any other unreviewed change. This does not approve QR deploys.
        current_lock['packages']['']['dependencies'].pop('qr')
        current_lock['packages'].pop('node_modules/qr')
        # Block 10 is also outside this historical authorization. Remove only
        # its known additions; exact historical hashes below still reject any
        # hidden change. No deployment guard or approved lock hash is changed.
        current_lock['packages']['']['dependencies'].pop('web-push')
        current_lock['packages']['']['devDependencies'].pop('@types/web-push')
        for name in ['@types/web-push', 'web-push', 'agent-base', 'asn1.js',
                     'bn.js', 'buffer-equal-constant-time', 'ecdsa-sig-formatter',
                     'http_ece', 'https-proxy-agent', 'jwa', 'jws',
                     'minimalistic-assert', 'safer-buffer']:
            current_lock['packages'].pop('node_modules/' + name)
        for name in ['debug', 'inherits', 'minimist', 'ms', 'safe-buffer']:
            entry = current_lock['packages']['node_modules/' + name]
            restored = {}
            for field, value in entry.items():
                restored[field] = value
                if field == 'integrity':
                    restored['dev'] = True
            current_lock['packages']['node_modules/' + name] = restored
        current = (json.dumps(current_lock, indent=2, ensure_ascii=False) + '\n').encode()
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
            protected = base / ('deployment-' + 'd'*40)
            protected.mkdir()
            (protected/'database.dump').write_bytes(b'private backup')
            (protected/'result.json').write_text(json.dumps({'status':'published','commit':'d'*40,'private_backup_retained':True}))
            with patch.object(remote, 'DATA', base):
                remote.prune_completed(current)
            self.assertEqual((protected/'database.dump').read_bytes(),b'private backup')
            self.assertTrue(current.is_dir())
            self.assertFalse(older.exists())
            self.assertEqual((sentinel / 'data').read_text(), 'preserved')
            self.assertTrue(interrupted.is_dir())

    def test_qr_lock_is_outside_historical_probe_deploy_authorization(self):
        _, reviewed = self.reviewed_probe_locks()
        candidate = (deploy.ROOT / 'package-lock.json').read_bytes()
        with tempfile.TemporaryDirectory() as directory:
            old, new = Path(directory) / 'old', Path(directory) / 'new'
            self.runtime(old)
            self.runtime(new)
            (old / 'package-lock.json').write_bytes(reviewed)
            (new / 'package-lock.json').write_bytes(candidate)
            with patch.object(remote, 'run') as command:
                with self.assertRaises(RuntimeError):
                    remote.compatibility(new, old)
            command.assert_not_called()

    def test_web_push_lock_is_outside_historical_probe_authorization(self):
        _, reviewed = self.reviewed_probe_locks()
        candidate = json.loads((deploy.ROOT / 'package-lock.json').read_bytes())
        candidate['packages']['']['dependencies'].pop('qr')
        candidate['packages'].pop('node_modules/qr')
        with tempfile.TemporaryDirectory() as directory:
            old, new = Path(directory) / 'old', Path(directory) / 'new'
            self.runtime(old)
            self.runtime(new)
            (old / 'package-lock.json').write_bytes(reviewed)
            (new / 'package-lock.json').write_text(json.dumps(candidate))
            with patch.object(remote, 'run') as command:
                with self.assertRaises(RuntimeError):
                    remote.compatibility(new, old)
            command.assert_not_called()

    def test_real_git_build_preserves_sources_and_reuses_verified_cache(self):
        # Build a clean synthetic Git snapshot of the candidate sources. Never
        # commit the user's checkout or bypass prepare's exact-lock protection.
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / 'source'
            root.mkdir()
            files = subprocess.check_output(['git', 'ls-files', '-co', '--exclude-standard', '-z'], cwd=deploy.ROOT).split(b'\0')
            deleted = set(subprocess.check_output(['git', 'ls-files', '--deleted', '-z'], cwd=deploy.ROOT).split(b'\0'))
            for raw in files:
                if not raw or raw in deleted:
                    continue
                relative = Path(os.fsdecode(raw))
                target = root / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(deploy.ROOT / relative, target)
            subprocess.check_call(['git', 'init', '--quiet'], cwd=root)
            subprocess.check_call(['git', 'add', '.'], cwd=root)
            subprocess.check_call(['git', '-c', 'user.name=Test fixture', '-c',
                                   'user.email=fixture@example.invalid', 'commit', '--quiet', '-m', 'Synthetic release candidate'], cwd=root)
            revision = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip()
            (root / 'node_modules').symlink_to(deploy.ROOT / 'node_modules', target_is_directory=True)
            original_run = deploy.run
            with (patch.object(deploy, 'LOCAL', Path(directory) / 'artifacts'),
                  patch.object(deploy, 'ROOT', root),
                  patch.object(deploy, 'run', side_effect=lambda args, cwd=root, timeout=30: original_run(args, cwd=cwd, timeout=timeout))):
                prepared, archive_path = deploy.prepare(revision, 'codex/test')
                self.assertLessEqual(archive_path.stat().st_size, remote.MAX_ARCHIVE)
                self.assertEqual(len(prepared['source_parts']), 18)
                self.assertEqual(len([n for n in prepared['files'] if n in deploy.public_sources.PARTS]),18)
                with patch.object(deploy.shutil, 'copytree', side_effect=AssertionError('cache rebuilt')):
                    cached, cached_path = deploy.prepare(revision, 'codex/test')
                    self.assertEqual(cached, prepared)
                    self.assertEqual(cached_path, archive_path)
                with tarfile.open(archive_path) as archive:
                    names = archive.getnames()
                    self.assertTrue(all(n == 'dist' or n.startswith('dist/') for n in names))
                    source = next(n for n in names if '/source-' in n and n.endswith('.tar.gz'))
                    with tarfile.open(fileobj=io.BytesIO(archive.extractfile(source).read())) as corresponding:
                        entries = corresponding.getnames()
                        self.assertTrue(any(n.startswith('node_modules/qr/src/') for n in entries))
                        self.assertTrue(any(n.startswith('node_modules/@scure/base/') for n in entries))
                        self.assertTrue(any(n.startswith('node_modules/@wallet-standard/app/') for n in entries))
                        self.assertTrue(any(n.startswith('node_modules/@matrix-org/matrix-sdk-crypto-wasm/') for n in entries))
                        self.assertIn('src/client/emoji/index.ts', entries)
                        self.assertIn('src/tools/frontend-emoji.ts', entries)
                        self.assertIn('vendor/emoji/LICENSE-GRAPHICS.txt', entries)
                        self.assertFalse(any(n.startswith(('.local/', 'src/server/', '.git/')) for n in entries))
                    emoji = 'dist/web/emoji-d7a2c1166a29ac85.json.gz'
                    self.assertIn(emoji, names)
                    self.assertLessEqual(archive.getmember(emoji).size, 2 * 1024 * 1024)
                    self.assertEqual(len([n for n in names if '/matrix-crypto-18.9.0-source-' in n and n.endswith('.bin')]), 0)

                original_archive=archive_path.read_bytes()
                archive_path.write_bytes(b'corrupt cache')
                with self.assertRaisesRegex(RuntimeError,'Cached build commit/archive mismatch'):
                    deploy.prepare(revision,'codex/test')
                archive_path.write_bytes(original_archive)
                (root / 'package-lock.json').write_text('unreviewed working tree')
                with self.assertRaisesRegex(RuntimeError, 'Development lockfile differs'):
                    deploy.prepare(revision, 'codex/test')

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
            (script.parent/'deploy_sources.py').write_text('source reconstruction')
            value = manifest()
            value['files']['infra/staging/deploy_remote.py'] = 'a' * 64
            with patch.object(deploy, 'ROOT', root), patch.object(deploy.subprocess, 'run') as command:
                with self.assertRaises(RuntimeError):
                    deploy.remote('check', value, 'root@example.test')
            command.assert_not_called()

    def test_public_verification_uses_matching_hash_or_checks_full_content(self):
        expected=remote.hashlib.sha256(b'public').hexdigest()
        with patch.object(remote,'run',return_value=b'\n304') as command:
            self.assertIsNone(remote.fetch('/asset.bin',expected))
            self.assertIn('If-None-Match: "'+expected+'"',command.call_args.args[0])
        for path,limit in [('/matrix-crypto-18.9.0.wasm',8*1024*1024),('/asset.bin',2*1024*1024)]:
            with patch.object(remote,'run',return_value=b'public\n200') as command:
                self.assertEqual(remote.fetch(path,expected),b'public')
                args=command.call_args.args[0]
                self.assertEqual(args[args.index('--max-filesize')+1],str(limit))
        for body in [b'payload\n304',b'payload\n206',b'no status']:
            with patch.object(remote,'run',return_value=body),self.assertRaises(RuntimeError):
                remote.fetch('/asset.bin',expected)
        value={'dist/web/asset.bin':expected}
        for result in [None,b'public',b'changed']:
            with patch.object(remote,'fetch',side_effect=[b'{"status":"ok"}',result]),patch.object(remote.time,'sleep'):
                if result==b'changed':
                    with self.assertRaises(RuntimeError):remote.healthy(value)
                else: remote.healthy(value)

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


class AttachmentDeploymentTests(unittest.TestCase):
    count = 16
    before_key = 'ATTACHMENT_BEFORE'
    reviewed_key = 'ATTACHMENT_REVIEWED'
    review_name = 'attachment_review'
    snapshot_name = 'attachment_snapshot'
    verify_name = 'verify_attachment_migration'
    activate_name = 'activate_attachments'
    table_name = 'message_attachments'

    def migrations(self, root):
        directory = root / 'src/server/database/migrations'
        directory.mkdir(parents=True)
        for number in range(1, self.count + 1):
            (directory / ('%03d.sql' % number)).write_text('fixture%d' % number)

    def test_only_exact_reviewed_sources_and_predecessor_allow_migration(self):
        with tempfile.TemporaryDirectory() as directory:
            old, new = Path(directory) / 'old', Path(directory) / 'new'
            self.migrations(new)
            previous = {'src/main.ts':b'old', 'package.json':b'{}',
                        'package-lock.json':b'lock', '.nvmrc':b'24.14.0'}
            incoming = dict(previous, **{'src/main.ts':b'reviewed'})
            for path in (new / 'src/server/database/migrations').iterdir():
                name = str(path.relative_to(new))
                incoming[name] = path.read_bytes()
                if not path.name.startswith('%03d' % self.count): previous[name] = path.read_bytes()
            for root, files in [(old, previous), (new, incoming)]:
                for name, data in files.items():
                    path = root / name; path.parent.mkdir(parents=True, exist_ok=True); path.write_bytes(data)
            exports = {getattr(remote,self.before_key):previous, getattr(remote,self.reviewed_key):incoming}
            review = getattr(remote,self.review_name)
            with patch.object(backups, 'git_export', side_effect=lambda r:exports[r]):
                review(new, old)
                remote.database_review(new, old)
                for root, name in [(old, 'src/main.ts'), (new, 'src/main.ts'),
                                   (new, 'src/server/database/migrations/001.sql'),
                                   (new, 'package-lock.json')]:
                    path = root / name; value = path.read_bytes(); path.write_bytes(b'unreviewed')
                    with self.assertRaises(RuntimeError): review(new, old)
                    path.write_bytes(value)
                (new / ('src/server/database/migrations/%03d.sql' % (self.count + 1))).write_text('unreviewed')
                with self.assertRaises(RuntimeError): review(new, old)

    def test_migration_checksums_existing_data_and_ledger_are_preserved(self):
        with tempfile.TemporaryDirectory() as directory:
            candidate = Path(directory); self.migrations(candidate)
            versions = remote.attachment_versions(candidate)
            before = {'versions':versions[:-1], 'tables':{'message_packets':'preserved','content_usage':'preserved'}}
            after = dict(before, versions=versions)
            verify = getattr(remote,self.verify_name)
            with patch.object(remote, self.snapshot_name, return_value=after), patch.object(backups, 'pg', return_value=b't') as pg:
                verify(candidate, before)
                sql = pg.call_args.args[0][-1]
                self.assertIn('NOT EXISTS(SELECT 1 FROM hash_talk.' + self.table_name + ')', sql)
                self.assertIn('sum(charge) FROM hash_talk.message_packets', sql)
                if self.count == 17:
                    self.assertIn('NOT EXISTS(SELECT 1 FROM hash_talk.message_packets WHERE personal_collected)',sql)
                    self.assertIn('sum(charge) FROM hash_talk.personal_removals',sql)
            for invalid in [dict(after,tables={}), dict(after,versions=versions[:-1])]:
                with patch.object(remote, self.snapshot_name, return_value=invalid), self.assertRaises(RuntimeError):
                    verify(candidate, before)
            with patch.object(remote, self.snapshot_name, return_value=after), patch.object(backups, 'pg', return_value=b'f'), self.assertRaises(RuntimeError):
                verify(candidate, before)
            with patch.object(backups, 'database_snapshot') as snapshot:
                getattr(remote,self.snapshot_name)()
                if self.count == 18:
                    snapshot.assert_called_once_with(remote.DAILY_TABLES,
                        omit_columns={'message_packets':('relation','deletion_account')})
                    self.assertEqual(len(remote.DAILY_TABLES),24)
                elif self.count == 17:
                    snapshot.assert_called_once_with(remote.BACKUP_TABLES,
                        omit_columns={'message_packets':('personal_collected',)})
                    self.assertEqual(len(remote.BACKUP_TABLES),23)
                else:
                    snapshot.assert_called_once_with(remote.ATTACHMENT_TABLES)
                    self.assertEqual(len(remote.ATTACHMENT_TABLES),22)

    def check_activation(self, failure):
        with tempfile.TemporaryDirectory() as directory, ExitStack() as stack:
            root = Path(directory); live = root / 'release'; live.mkdir(); (live / 'version').write_text('old')
            work = root / 'deployment'; work.mkdir(); candidate = work / 'candidate'; candidate.mkdir()
            (candidate / 'version').write_text('new'); (work / 'objects-backup').mkdir()
            config = {'commit':'a'*40, 'baseline':{}, 'files':{}}
            before = {'tables':{'message_packets':'preserved'}, 'versions':[{'version':n} for n in range(1,self.count)]}
            state = {'value':before}
            def migrate(_):
                state['value'] = dict(before, versions=[{'version':self.count}])
                if failure == 'migration': raise RuntimeError('failed before opening')
            def restore(*_, **kwargs): state['value'] = before
            for module, name, options in [
                (remote,'DATA',{'new':root}), (remote,self.review_name,{}),
                (remote,self.snapshot_name,{'side_effect':lambda:state['value']}),
                (remote,'attachment_versions',{'return_value':before['versions']}),
                (remote,'own_state',{'return_value':{}}), (remote,'preservation',{}),
                (remote,self.verify_name,{}),
                (backups,'own_free_bytes',{'return_value':2**30}),
                (backups,'objects_snapshot',{'return_value':{}}),
                (backups,'backup',{'return_value':'backup-hash'}),
                (backups,'validate_restore',{}), (backups,'migrate',{'side_effect':migrate})]:
                stack.enter_context(patch.object(module, name, **options))
            command = stack.enter_context(patch.object(remote,'run',return_value=b'0'))
            returned = stack.enter_context(patch.object(backups,'restore',side_effect=restore))
            ready = stack.enter_context(patch.object(remote,'wait_ready',side_effect=RuntimeError('failed after opening') if failure=='opened' else None))
            activate = getattr(remote,self.activate_name)
            if failure:
                with self.assertRaises(RuntimeError): activate(config,work,candidate,{})
            else: activate(config,work,candidate,{})
            receipt = json.loads((work / 'result.json').read_text())
            commands = [c.args[0] for c in command.call_args_list]
            self.assertTrue(all(c[:2]==['systemctl','show'] or c in [['systemctl','start',remote.UNIT],['systemctl','stop',remote.UNIT]] for c in commands))
            if failure == 'migration':
                returned.assert_called_once_with(work,before,'backup-hash',snapshot=getattr(remote,self.snapshot_name))
                self.assertTrue(receipt['rollback_verified']); self.assertEqual(state['value'],before)
                self.assertEqual((live / 'version').read_text(),'old')
            elif failure == 'opened':
                returned.assert_not_called(); self.assertTrue(receipt['new_state_preserved'])
                self.assertFalse(receipt['rollback_verified']); self.assertEqual(commands[-1],['systemctl','stop',remote.UNIT])
                self.assertEqual((live / 'version').read_text(),'new')
            else:
                returned.assert_not_called(); self.assertEqual(receipt['status'],'published')
                self.assertTrue(receipt['private_backup_retained']); self.assertEqual((live / 'version').read_text(),'new')
                ready.assert_called_once_with(config['files'])
            self.assertTrue((work / 'objects-backup').is_dir())

    def test_success_retains_backup_and_previous_release(self): self.check_activation(None)
    def test_preopening_failure_restores_schema_and_previous_release(self): self.check_activation('migration')
    def test_postopening_failure_preserves_new_data_and_stops_only_own_service(self): self.check_activation('opened')


class BackupDeploymentTests(AttachmentDeploymentTests):
    count = 17
    before_key = 'BACKUP_BEFORE'
    reviewed_key = 'BACKUP_REVIEWED'
    review_name = 'backup_review'
    snapshot_name = 'backup_snapshot'
    verify_name = 'verify_backup_migration'
    activate_name = 'activate_backups'
    table_name = 'personal_removals'

    def test_snapshot_column_projection_is_bounded_and_parameterized(self):
        for columns in [{'other_table':('personal_collected',)},
                        {'message_packets':("x';drop table accounts;--",)},
                        {'message_packets':'personal_collected'}]:
            with patch.object(backups,'node') as query, self.assertRaises(RuntimeError):
                backups.database_snapshot(('message_packets',),omit_columns=columns)
            query.assert_not_called()
        with patch.object(backups,'node',return_value=b'{"tables":{},"versions":[]}') as query:
            remote.backup_snapshot()
        code = query.call_args.args[0]
        self.assertIn('to_jsonb(t)-$1::text[]',code)
        self.assertIn('"message_packets": ["personal_collected"]',code)


class DailyDeploymentTests(AttachmentDeploymentTests):
    count = 18
    before_key = 'DAILY_BEFORE'
    reviewed_key = 'DAILY_REVIEWED'
    review_name = 'daily_review'
    snapshot_name = 'daily_snapshot'
    verify_name = 'verify_daily_migration'
    activate_name = 'activate_daily'
    table_name = 'daily_controls'

    def test_only_exact_reviewed_sources_and_predecessor_allow_migration(self):
        incoming_lock = json.loads((deploy.ROOT / 'package-lock.json').read_bytes())
        old_lock = json.loads(json.dumps(incoming_lock))
        old_lock['packages']['']['dependencies'].pop('web-push')
        old_lock['packages']['']['devDependencies'].pop('@types/web-push')
        added = set(runtime.PACKAGES) - {'debug','inherits','minimist','ms','safe-buffer'}
        for name in added | {'@types/web-push'}:
            old_lock['packages'].pop('node_modules/' + name)
        for name in set(runtime.PACKAGES) - added:
            entry = old_lock['packages']['node_modules/' + name]
            restored = {}
            for field, value in entry.items():
                restored[field] = value
                if field == 'integrity': restored['dev'] = True
            old_lock['packages']['node_modules/' + name] = restored
        old_bytes = (json.dumps(old_lock, indent=2, ensure_ascii=False) + '\n').encode()
        self.assertEqual(hashlib.sha256(old_bytes).hexdigest(), runtime.BEFORE_LOCK)
        with tempfile.TemporaryDirectory() as directory:
            old, new = Path(directory) / 'old', Path(directory) / 'new'
            self.migrations(new)
            package = json.loads((deploy.ROOT / 'package.json').read_bytes())
            old_package = json.loads(json.dumps(package))
            old_package['dependencies'].pop('web-push')
            old_package['devDependencies'].pop('@types/web-push')
            previous = {'src/main.ts':b'old', 'package.json':json.dumps(old_package).encode(),
                        'package-lock.json':old_bytes, '.nvmrc':b'24.14.0'}
            incoming = dict(previous, **{'src/main.ts':b'reviewed',
                'package.json':json.dumps(package).encode(),
                'package-lock.json':(deploy.ROOT / 'package-lock.json').read_bytes()})
            for path in (new / 'src/server/database/migrations').iterdir():
                name = str(path.relative_to(new)); incoming[name] = path.read_bytes()
                if not path.name.startswith('018'): previous[name] = path.read_bytes()
            for root, files in [(old,previous),(new,incoming)]:
                for name, blob in files.items():
                    path = root / name; path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(blob)
            exports = {remote.DAILY_BEFORE:previous,remote.DAILY_REVIEWED:incoming}
            with patch.object(backups,'git_export',side_effect=lambda r:exports[r]), patch.object(remote,'run',return_value=b'v24.14.0'):
                remote.compatibility(new,old)
                for root, name in [(old,'src/main.ts'),(new,'src/main.ts'),
                                   (new,'src/server/database/migrations/001.sql'),
                                   (new,'package-lock.json'),(new,'.nvmrc'),(new,'package.json')]:
                    path = root/name; blob = path.read_bytes();path.write_bytes(b'unreviewed')
                    with self.assertRaises((RuntimeError,json.JSONDecodeError)):
                        remote.compatibility(new,old)
                    path.write_bytes(blob)

    def test_snapshot_keeps_all_existing_fields_and_initial_tables_are_empty(self):
        with patch.object(backups,'database_snapshot') as snapshot:
            remote.daily_snapshot()
            snapshot.assert_called_once_with(remote.DAILY_TABLES,
                omit_columns={'message_packets':('relation','deletion_account')})
        self.assertEqual(len(remote.DAILY_TABLES),24)
        with tempfile.TemporaryDirectory() as directory:
            candidate=Path(directory);self.migrations(candidate)
            versions=remote.attachment_versions(candidate)
            before={'versions':versions[:-1],'tables':{'existing':'preserved'}}
            with patch.object(remote,'daily_snapshot',return_value=dict(before,versions=versions)), patch.object(backups,'pg',return_value=b't') as pg:
                remote.verify_daily_migration(candidate,before)
            sql=pg.call_args.args[0][-1]
            for table in remote.DAILY_NEW_TABLES:
                self.assertIn('NOT EXISTS(SELECT 1 FROM hash_talk.'+table+')',sql)
                self.assertIn('sum(charge) FROM hash_talk.'+table,sql)
            self.assertIn('relation IS NOT NULL OR deletion_account IS NOT NULL',sql)



class HistoricalBackupRetentionTests(unittest.TestCase):
    def completed(self, root, commit, timestamp):
        work = root / ('deployment-' + commit)
        work.mkdir()
        (work/'previous').mkdir(); (work/'previous/package.json').write_text('{}')
        (work/'build.tar.gz').write_bytes(b'code')
        (work/'database.dump').write_bytes(b'private database')
        (work/'objects-backup').mkdir(); (work/'objects-backup/file').write_bytes(b'private object')
        marker = work/'result.json'
        marker.write_text(json.dumps({'status':'published','commit':commit,'private_backup_retained':True}))
        os.utime(marker,(timestamp,timestamp))
        return work

    def test_completed_code_releases_slots_without_losing_historical_backups_or_latest_rollback(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            old = self.completed(root,'a'*40,1)
            latest = self.completed(root,'b'*40,2)
            interrupted = root/('deployment-'+'c'*40); interrupted.mkdir()
            (interrupted/'result.json').write_text('{"status":"failed"}')
            (old/'qr.tar.gz').write_bytes(b'approved QR artifact')
            receipt = (old/'result.json').read_bytes()
            with patch.object(remote,'DATA',root):
                remote.prune_completed(root/('deployment-'+'d'*40))
            kept = root/'migration-backups'/('a'*40)
            self.assertFalse(old.exists())
            self.assertEqual((kept/'database.dump').read_bytes(),b'private database')
            self.assertEqual((kept/'objects-backup/file').read_bytes(),b'private object')
            self.assertEqual((kept/'result.json').read_bytes(),receipt)
            self.assertEqual((kept/'qr.tar.gz').read_bytes(),b'approved QR artifact')
            self.assertFalse((kept/'previous').exists()); self.assertFalse((kept/'build.tar.gz').exists())
            self.assertTrue((latest/'previous/package.json').is_file())
            self.assertTrue(interrupted.is_dir())

    def test_unexpected_contents_links_or_collisions_stop_before_modifying_backups(self):
        for invalid in ['unexpected','link','collision']:
            with self.subTest(invalid=invalid), tempfile.TemporaryDirectory() as directory:
                root = Path(directory); old = self.completed(root,'a'*40,1)
                self.completed(root,'b'*40,2)
                if invalid == 'unexpected': (old/'unexpected').write_text('preserve')
                elif invalid == 'link':
                    (old/'database.dump').unlink(); (old/'database.dump').symlink_to(old/'result.json')
                else: (root/'migration-backups'/('a'*40)).mkdir(parents=True)
                receipt = (old/'result.json').read_bytes()
                with patch.object(remote,'DATA',root), self.assertRaises(RuntimeError):
                    remote.prune_completed(root/('deployment-'+'d'*40))
                self.assertEqual((old/'result.json').read_bytes(),receipt)
                self.assertTrue((old/'objects-backup/file').is_file())


if __name__ == '__main__':
    unittest.main()
