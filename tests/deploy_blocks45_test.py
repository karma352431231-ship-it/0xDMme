"""Verify the scoped transition and failure boundaries without SSH or real data."""

import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'infra/staging'))
import deploy_blocks45 as transition
import deploy_remote as base


class ReviewedTransitionTests(unittest.TestCase):
    def test_objects_above_256_mib_are_hashed_without_size_rejection_or_full_ram_copy(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);objects=root/'objects/content';objects.mkdir(parents=True)
            file=objects/'opaque';size=256*1024*1024+1
            with file.open('wb') as output:output.truncate(size)
            expected=hashlib.sha256();block=b'\0'*1024*1024
            for _ in range(256):expected.update(block)
            expected.update(b'\0')
            with (patch.object(base,'DATA',root),patch.object(Path,'read_bytes',side_effect=AssertionError('full RAM copy'))):
                self.assertEqual(transition.objects_snapshot(),{'opaque':expected.hexdigest()})
            self.assertEqual(file.stat().st_size,size)

    def test_free_space_reserve_uses_measured_database_and_object_sizes(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);objects=root/'objects/content';objects.mkdir(parents=True)
            (objects/'opaque').write_bytes(b'x'*123)
            with patch.object(base,'DATA',root),patch.object(transition,'node',return_value=str(90*1024*1024).encode()):
                self.assertEqual(transition.required_backup_space(),2*base.MAX_RELEASE+3*(90*1024*1024)+2*123)

    def test_restore_sql_above_64_mib_stays_private_atomic_and_file_backed(self):
        from deploy_backup_io import restore_transaction
        consumed=[]
        def execute(args,**options):
            if args[0]=='pg_restore':
                # Match real pg_restore: a child process writes to the shared
                # descriptor after the parent's transaction prefix was flushed.
                subprocess.run([sys.executable,'-c',
                    "import sys; block=b'x'*1024*1024; [sys.stdout.buffer.write(block) for _ in range(65)]"],
                    stdout=options['output'],check=True,timeout=10)
                return
            self.assertNotIn('input',options)
            content=options['input_file']
            self.assertEqual(Path(content.name).stat().st_mode&0o077,0)
            self.assertTrue(content.read(64).startswith(b'BEGIN; DROP SCHEMA hash_talk CASCADE;'))
            content.seek(-16,os.SEEK_END);consumed.append(content.read())
            self.assertGreater(Path(content.name).stat().st_size,64*1024*1024)
        with tempfile.TemporaryDirectory() as directory:
            work=Path(directory)
            for rollback in [True,False]:
                restore_transaction(work,work/'dump',execute,rollback=rollback)
            self.assertEqual(list(work.iterdir()),[])
        self.assertTrue(consumed[0].endswith(b'ROLLBACK;\n'))
        self.assertTrue(consumed[1].endswith(b'COMMIT;\n'))

    def test_failed_dump_decode_never_opens_psql_and_removes_partial_sql(self):
        from deploy_backup_io import restore_transaction
        calls=[]
        def execute(args,**options):
            calls.append(args[0]);options['output'].write(b'partial')
            raise RuntimeError('decode failed')
        with tempfile.TemporaryDirectory() as directory:
            work=Path(directory)
            with self.assertRaisesRegex(RuntimeError,'decode failed'):
                restore_transaction(work,work/'dump',execute,rollback=False)
            self.assertEqual(list(work.iterdir()),[])
        self.assertEqual(calls,['pg_restore'])

    def exports(self, old, new):
        previous = {'src/server/database/old.sql':b'old', 'package-lock.json':b'old-lock',
                    '.nvmrc':b'24.14.0', 'package.json':b'{"engines":{"node":">=24.14.0 <25"}}'}
        incoming = {'src/server/database/new.sql':b'approved', 'package-lock.json':b'qr-lock',
                    '.nvmrc':b'24.14.0', 'package.json':b'{"engines":{"node":">=24.14.0 <25"},"scripts":{}}'}
        for root, files in [(old, previous), (new, incoming)]:
            for name, value in files.items():
                path = root / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(value)
        package = json.loads(incoming['package.json'])
        package['scripts']['deploy:blocks45'] = 'python3 infra/staging/deploy_blocks45.py --activate'
        (new / 'package.json').write_text(json.dumps(package))
        return {transition.BEFORE:previous, transition.REVIEWED:incoming}

    def test_exact_reviewed_application_and_contract_only(self):
        with tempfile.TemporaryDirectory() as directory:
            old, new = Path(directory) / 'old', Path(directory) / 'new'
            exports = self.exports(old, new)
            with patch.object(transition, 'git_export', side_effect=lambda revision:exports[revision]), \
                    patch.object(base, 'run', return_value=b'v24.18.1'):
                transition.reviewed_candidate(new, old)
                for name in ['src/server/database/new.sql', 'package-lock.json', '.nvmrc', 'package.json']:
                    original = (new / name).read_bytes()
                    (new / name).write_bytes(b'{"unreviewed":true}' if name == 'package.json' else b'unreviewed')
                    with self.assertRaises(RuntimeError):
                        transition.reviewed_candidate(new, old)
                    (new / name).write_bytes(original)
                (old / 'src/server/database/old.sql').write_bytes(b'drift')
                with self.assertRaises(RuntimeError):
                    transition.reviewed_candidate(new, old)

    def test_qr_package_is_exact_and_links_are_rejected(self):
        source = Path(__file__).resolve().parents[1] / 'node_modules/qr'
        transition.qr_tree(source)
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / 'qr'
            shutil.copytree(source, root)
            (root / 'index.js').write_text('modified')
            with self.assertRaises(RuntimeError):
                transition.qr_tree(root)
            (root / 'index.js').unlink()
            (root / 'index.js').symlink_to(source / 'index.js')
            with self.assertRaises(RuntimeError):
                transition.qr_tree(root)

    def fixture(self, root):
        live = root / 'release'
        live.mkdir()
        (live / 'version').write_text('old')
        work = root / 'deployment'
        work.mkdir()
        for name in ['build.tar.gz', 'qr.tar.gz']:
            (work / name).write_bytes(b'opaque-archive')
        candidate = work / 'candidate'
        candidate.mkdir()
        (candidate / 'version').write_text('new')
        backup = work / 'objects-backup'
        backup.mkdir()
        (backup / 'ciphertext').write_bytes(b'opaque')
        sentinel = root / 'unrelated-project'
        sentinel.write_text('preserve')
        checksum = hashlib.sha256(b'opaque-archive').hexdigest()
        config = {'commit':'a' * 40, 'archive_sha256':checksum, 'qr_sha256':checksum,
                  'files':{}, 'baseline':{}}
        before = {'tables':{'accounts':{'count':1,'hash':'fixed'}}, 'versions':[{'version':3}]}
        objects = transition.file_tree(backup)
        return live, work, candidate, sentinel, config, before, objects

    def run_fixture(self, directory, failure):
        from contextlib import ExitStack
        root = Path(directory)
        live, work, candidate, sentinel, config, before, objects = self.fixture(root)
        state = {'value':before}
        def migrate(_):
            state['value'] = dict(before, versions=[{'version':9}])
            if failure == 'migration':
                raise RuntimeError('migration verification fails')
        def restore(*_):
            state['value'] = before
        with ExitStack() as stack:
            stack.enter_context(patch.object(base, 'DATA', root))
            stack.enter_context(patch.object(base, 'preflight', return_value={}))
            stack.enter_context(patch.object(base, 'own_state', return_value={}))
            stack.enter_context(patch.object(base, 'preservation'))
            command = stack.enter_context(patch.object(base, 'run', return_value=b'0'))
            ready = stack.enter_context(patch.object(base, 'wait_ready',
                side_effect=RuntimeError('failed after opening') if failure == 'opened' else None))
            stack.enter_context(patch.object(base, 'prune_completed'))
            stack.enter_context(patch.object(transition, 'prepare_candidate', return_value=candidate))
            stack.enter_context(patch.object(transition, 'own_free_bytes', return_value=2**30))
            stack.enter_context(patch.object(transition, 'required_backup_space', return_value=1024))
            stack.enter_context(patch.object(transition, 'database_snapshot', side_effect=lambda:state['value']))
            stack.enter_context(patch.object(transition, 'objects_snapshot', return_value=objects))
            stack.enter_context(patch.object(transition, 'backup', return_value='b' * 64))
            stack.enter_context(patch.object(transition, 'validate_restore'))
            stack.enter_context(patch.object(transition, 'migrate', side_effect=migrate))
            stack.enter_context(patch.object(transition, 'verify_migration'))
            returned = stack.enter_context(patch.object(transition, 'restore', side_effect=restore))
            if failure:
                with self.assertRaises(RuntimeError):
                    transition.activate(config, work)
            else:
                transition.activate(config, work)
            commands = [call.args[0] for call in command.call_args_list]
            self.assertTrue(all(cmd[0:2] == ['systemctl', 'show'] or cmd in [
                ['systemctl', 'stop', base.UNIT], ['systemctl', 'start', base.UNIT]] for cmd in commands))
            self.assertEqual(sentinel.read_text(), 'preserve')
            receipt = json.loads((work / 'result.json').read_text())
            if failure == 'migration':
                returned.assert_called_once_with(work, before, 'b' * 64)
                self.assertTrue(receipt['rollback_verified'])
                self.assertEqual((live / 'version').read_text(), 'old')
                self.assertEqual(state['value'], before)
            elif failure == 'opened':
                returned.assert_not_called()
                self.assertTrue(receipt['new_state_preserved'])
                self.assertFalse(receipt['rollback_verified'])
                self.assertEqual(commands[-1], ['systemctl', 'stop', base.UNIT])
                self.assertEqual((live / 'version').read_text(), 'new')
                self.assertEqual((work / 'previous/version').read_text(), 'old')
                self.assertEqual(state['value']['versions'], [{'version':9}])
            else:
                returned.assert_not_called()
                self.assertEqual(receipt['status'], 'published')
                self.assertTrue(receipt['private_backup_retained'])
                self.assertEqual((live / 'version').read_text(), 'new')
                self.assertEqual((work / 'previous/version').read_text(), 'old')
                ready.assert_called_once_with(config['files'])

    def test_success_preserves_backups_and_other_project(self):
        with tempfile.TemporaryDirectory() as directory:
            self.run_fixture(directory, None)

    def test_preopening_failure_restores_database_before_starting_old_writer(self):
        with tempfile.TemporaryDirectory() as directory:
            self.run_fixture(directory, 'migration')

    def test_after_opening_failure_never_discards_new_writes(self):
        with tempfile.TemporaryDirectory() as directory:
            self.run_fixture(directory, 'opened')

    def test_interrupted_receipt_prevents_repeat_activation(self):
        with tempfile.TemporaryDirectory() as directory:
            work = Path(directory)
            (work / 'result.json').write_text('{"status":"maintenance"}')
            with patch.object(base, 'preflight'), patch.object(transition, 'prepare_candidate') as prepare:
                with self.assertRaises(RuntimeError):
                    transition.activate({}, work)
            prepare.assert_not_called()

    def test_restore_is_own_schema_atomic_and_checks_the_return(self):
        with tempfile.TemporaryDirectory() as directory:
            work = Path(directory)
            before = {'versions':[{'version':3}], 'tables':{}}
            with patch.object(base, 'digest', return_value='b' * 64), \
                    patch.object(transition, 'restore_transaction') as restore_sql, \
                    patch.object(transition, 'database_snapshot', return_value=before):
                transition.restore(work, before, 'b' * 64)
                restore_sql.assert_called_once_with(work,work/'database.dump',transition.pg,rollback=False)
                with self.assertRaises(RuntimeError):
                    transition.restore(work, before, 'c' * 64)

    def test_manifest_preservation_and_usage_counter_are_both_required(self):
        with tempfile.TemporaryDirectory() as directory:
            candidate = Path(directory)
            migrations = candidate / 'src/server/database/migrations'
            migrations.mkdir(parents=True)
            (migrations / '001.sql').write_text('migration')
            before = {'tables':{'accounts':'same'}}
            after = dict(before, versions=[{'version':1, 'checksum':hashlib.sha256(b'migration').hexdigest()}])
            with patch.object(transition, 'database_snapshot', return_value=after), \
                    patch.object(transition, 'pg', return_value=b't\n'):
                transition.verify_migration(candidate, before)
            with patch.object(transition, 'database_snapshot', return_value=after), \
                    patch.object(transition, 'pg', return_value=b'f\n'):
                with self.assertRaises(RuntimeError):
                    transition.verify_migration(candidate, before)

    def test_restore_rehearsal_rolls_back_and_checks_original_state(self):
        with tempfile.TemporaryDirectory() as directory:
            work = Path(directory)
            before = {'versions':[{'version':3}], 'tables':{}}
            with patch.object(base,'digest',return_value='b'*64), \
                    patch.object(transition, 'restore_transaction') as restore_sql, \
                    patch.object(transition, 'database_snapshot', return_value=before):
                transition.validate_restore(work, before, 'b' * 64)
                restore_sql.assert_called_once_with(work,work/'database.dump',transition.pg,rollback=True)


if __name__ == '__main__':
    unittest.main()
