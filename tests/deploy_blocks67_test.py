"""Publication guards: exact source distribution, migrations and scoped proxy."""

from contextlib import ExitStack
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'infra/staging'))
import deploy_blocks67 as transition
import deploy_remote as base


class PublicationTests(unittest.TestCase):
    def proposal(self, path):
        old = 'server { client_max_body_size 5m; proxy_request_buffering off; }'
        new = old.replace('5m', '8m')
        return {'path':str(path), 'old_content':old, 'new_content':new,
                'old_sha256':hashlib.sha256(old.encode()).hexdigest(),
                'new_sha256':hashlib.sha256(new.encode()).hexdigest()}

    def test_proxy_validation_shadows_shared_logs_and_pid_only_in_its_namespace(self):
        from types import SimpleNamespace
        import shlex
        files={}
        for name in ['deploy_sources','deploy_remote','deploy_blocks45','deploy_blocks67']:
            files['infra/staging/'+name+'.py']=hashlib.sha256((Path(transition.__file__).parent/(name+'.py')).read_bytes()).hexdigest()
        with tempfile.TemporaryDirectory() as directory:
            local=Path(directory); (local/('a'*40)).mkdir()
            config={'commit':'a'*40,'files':files}
            result=SimpleNamespace(returncode=0,stdout=b'{"verified":true}',stderr=b'')
            with patch.object(transition.subprocess,'run',return_value=result) as run:
                for action in ['proxy','check']:
                    transition.send(action,config,'fixture',SimpleNamespace(LOCAL=local))
                    command=shlex.split(run.call_args.args[0][-1])
                    if action=='proxy':
                        self.assertIn('TemporaryFileSystem=/var/log/nginx:rw',command)
                        self.assertIn('BindPaths=/dev/null:/run/nginx.pid',command)
                    else:
                        self.assertFalse(any(x.startswith(('TemporaryFileSystem=','BindPaths=')) for x in command))
                    self.assertIn('ProtectSystem=strict',command)
                    self.assertIn('MemoryMax=192M',command)

    def test_proxy_scope_rejects_extra_changes_and_digest_tampering(self):
        proposal = self.proposal(transition.PROXY)
        transition.validate_proxy(proposal)
        for key, value in [('path','/etc/nginx/nginx.conf'), ('new_content','other configuration'), ('new_sha256','0'*64)]:
            with self.subTest(key=key), self.assertRaises(RuntimeError):
                transition.validate_proxy(dict(proposal, **{key:value}))

    def test_graceful_reload_preserves_master_and_rolls_back_failed_change(self):
        for failure in [False, True]:
            with tempfile.TemporaryDirectory() as directory:
                path = Path(directory) / 'own.conf'
                proposal = self.proposal(path)
                path.write_text(proposal['old_content'])
                with patch.object(transition,'PROXY',path), patch.object(transition,'preservation'), \
                        patch.object(base,'run',side_effect=[b'', RuntimeError('reload failed'), b'', b''] if failure else None) as run:
                    if failure:
                        with self.assertRaises(RuntimeError):
                            transition.proxy_change({'proxy':proposal})
                    else:
                        transition.proxy_change({'proxy':proposal})
                    self.assertEqual(path.read_text(), proposal['old_content' if failure else 'new_content'])
                    self.assertTrue(all(c.args[0] in [['nginx','-t'],['systemctl','reload','nginx']] for c in run.call_args_list))

    def test_http_review_preserves_original_files_and_process_contract(self):
        historical = {'files':{'opaque':'hash'}, 'services':{'opaque':'pid'}, 'sites':[{'host':'fixture.invalid','status':'502'}]}
        review = [{'host':'fixture.invalid','historical':'502','current':'404'}]
        original = json.dumps(historical,sort_keys=True)
        with patch.object(base,'preservation') as guard:
            transition.preservation({'baseline':historical,'site_review':review})
            self.assertEqual(guard.call_args.args[0]['files'], historical['files'])
            self.assertEqual(guard.call_args.args[0]['services'], historical['services'])
            self.assertEqual(guard.call_args.args[0]['sites'][0]['status'],'404')
        self.assertEqual(json.dumps(historical,sort_keys=True),original)
        # The current approved deployment baseline already records the response.
        current_baseline = dict(historical, sites=[{'host':'fixture.invalid','status':'404'}])
        current_review = [dict(review[0], historical='404')]
        with patch.object(base,'preservation') as guard:
            transition.preservation({'baseline':current_baseline,'site_review':current_review})
            self.assertEqual(guard.call_args.args[0]['sites'], current_baseline['sites'])
        review[0]['current'] = '200'
        with self.assertRaises(RuntimeError):
            transition.preservation({'baseline':historical,'site_review':review})

    def test_large_response_exception_is_only_the_exact_wasm_path(self):
        with patch.object(base,'run',return_value=b'body') as run:
            for path,limit in [('/matrix-crypto-18.9.0.wasm',8*1024*1024),('/other.wasm',2*1024*1024)]:
                transition.fetch(path)
                args=run.call_args.args[0]
                self.assertEqual(args[args.index('--max-filesize')+1],str(limit))
        with patch.object(base,'run',return_value=b'x'*(2*1024*1024+1)):
            with self.assertRaises(RuntimeError):
                transition.fetch('/other.wasm')

    def test_committed_sources_reconstruct_full_public_archive_and_detect_corruption(self):
        source = Path(__file__).resolve().parents[1] / transition.SOURCE_BLOB
        files = {}
        with source.open('rb') as handle:
            for name in transition.PARTS:
                files[name] = hashlib.sha256(handle.read(transition.PART_BYTES)).hexdigest()
        config = {'commit':'a'*40,'source_parts':list(transition.PARTS), 'source_sha256':transition.SOURCE_HASH,
                  'source_blob':transition.SOURCE_BLOB, 'source_bytes':transition.SOURCE_BYTES,'files':files}
        class Process:
            def __init__(self,*_,**__): self.stdout=source.open('rb')
            def wait(self,**_): return 0
            def poll(self): return 0
        with tempfile.TemporaryDirectory() as directory, patch.object(transition.subprocess,'Popen',Process):
            candidate = Path(directory)
            (candidate/'dist/web').mkdir(parents=True)
            transition.source_parts(config,candidate)
            combined=hashlib.sha256()
            for name in transition.PARTS: combined.update((candidate/name).read_bytes())
            self.assertEqual(combined.hexdigest(),transition.SOURCE_HASH)
            self.assertEqual(sum((candidate/n).stat().st_size for n in files),transition.SOURCE_BYTES)
            with self.assertRaises(RuntimeError): transition.source_parts(config,candidate)
        with tempfile.TemporaryDirectory() as directory, patch.object(transition.subprocess,'Popen',Process):
            candidate = Path(directory)
            (candidate/'dist/web').mkdir(parents=True)
            files[transition.PARTS[0]]='0'*64
            with self.assertRaises(RuntimeError): transition.source_parts(config,candidate)
        with self.assertRaises(RuntimeError):
            transition.source_parts(dict(config,source_parts=['../escape']),Path('/unused'))

    def test_migration_preserves_every_old_table_and_verifies_new_ledger(self):
        with tempfile.TemporaryDirectory() as directory:
            candidate=Path(directory)
            root=candidate/'src/server/database/migrations'
            root.mkdir(parents=True)
            for n in range(1,16): (root/('%03d.sql'%n)).write_text('fixture%d'%n)
            expected=transition.expected_versions(candidate)
            before={'tables':{'accounts':'unchanged','vault_operations':'unchanged'},'versions':expected[:9]}
            after=dict(before,versions=expected)
            with patch.object(transition,'database_snapshot',return_value=after), patch.object(transition.backup_tools,'pg',return_value=b't') as pg:
                transition.verify_migration(candidate,before)
                sql=pg.call_args.args[0][-1]
                for table in transition.NEW_TABLES: self.assertIn(table,sql)
                self.assertIn('vault_operations',sql)
            for changed in [dict(after,tables={}),dict(after,versions=expected[:14])]:
                with patch.object(transition,'database_snapshot',return_value=changed), self.assertRaises(RuntimeError):
                    transition.verify_migration(candidate,before)
            with patch.object(transition,'database_snapshot',return_value=after), patch.object(transition.backup_tools,'pg',return_value=b'f'), self.assertRaises(RuntimeError):
                transition.verify_migration(candidate,before)

    def test_snapshot_scope_is_the_reviewed_twelve_existing_tables(self):
        with patch.object(transition.backup_tools,'database_snapshot',return_value={}) as snapshot:
            transition.database_snapshot()
            snapshot.assert_called_once_with(transition.OLD_TABLES)
            self.assertEqual(len(transition.OLD_TABLES),12)


class TransitionFailureTests(unittest.TestCase):
    def check_failure_boundary(self, failure):
        with tempfile.TemporaryDirectory() as directory, ExitStack() as stack:
            root=Path(directory)
            live=root/'release'; live.mkdir(); (live/'version').write_text('old')
            work=root/'deployment'; work.mkdir()
            (work/'build.tar.gz').write_bytes(b'archive')
            candidate=work/'candidate'; candidate.mkdir(); (candidate/'version').write_text('new')
            (work/'objects-backup').mkdir()
            config={'commit':'a'*40,'archive_sha256':hashlib.sha256(b'archive').hexdigest(),
                    'proxy':{'new_sha256':'reviewed'},'files':{}}
            before={'tables':{'vault_operations':'preserved'}, 'versions':[{'version':n} for n in range(1,10)]}
            state={'value':before}
            def migrate(_):
                state['value']=dict(before,versions=[{'version':15}])
                if failure=='migration': raise RuntimeError('failed before opening')
            def restore(*_): state['value']=before
            stack.enter_context(patch.object(base,'DATA',root))
            stack.enter_context(patch.object(transition,'preflight',return_value={}))
            stack.enter_context(patch.object(transition,'preservation'))
            stack.enter_context(patch.object(base,'own_state',return_value={}))
            original_digest=base.digest
            stack.enter_context(patch.object(base,'digest',side_effect=lambda p:'reviewed' if p==transition.PROXY else original_digest(p)))
            command=stack.enter_context(patch.object(base,'run',return_value=b'0'))
            stack.enter_context(patch.object(transition,'prepare_candidate',return_value=candidate))
            stack.enter_context(patch.object(transition,'own_free_bytes',return_value=2**30))
            stack.enter_context(patch.object(transition,'database_snapshot',side_effect=lambda:state['value']))
            stack.enter_context(patch.object(transition,'expected_versions',return_value=before['versions']))
            stack.enter_context(patch.object(transition,'objects_snapshot',return_value={}))
            stack.enter_context(patch.object(transition,'backup',return_value='backup-hash'))
            stack.enter_context(patch.object(transition,'validate_restore'))
            stack.enter_context(patch.object(transition,'migrate',side_effect=migrate))
            stack.enter_context(patch.object(transition,'verify_migration'))
            returned=stack.enter_context(patch.object(transition,'restore',side_effect=restore))
            ready=stack.enter_context(patch.object(transition,'wait_ready',side_effect=RuntimeError('failed after opening') if failure=='opened' else None))
            if failure:
                with self.assertRaises(RuntimeError): transition.activate(config,work)
            else: transition.activate(config,work)
            receipt=json.loads((work/'result.json').read_text())
            commands=[c.args[0] for c in command.call_args_list]
            self.assertTrue(all(c[:2]==['systemctl','show'] or c in [['systemctl','start',base.UNIT],['systemctl','stop',base.UNIT]] for c in commands))
            if failure=='migration':
                returned.assert_called_once_with(work,before,'backup-hash')
                self.assertTrue(receipt['rollback_verified'])
                self.assertEqual(state['value'],before)
                self.assertEqual((live/'version').read_text(),'old')
            elif failure=='opened':
                returned.assert_not_called()
                self.assertTrue(receipt['new_state_preserved'])
                self.assertFalse(receipt['rollback_verified'])
                self.assertEqual(commands[-1],['systemctl','stop',base.UNIT])
                self.assertEqual((live/'version').read_text(),'new')
                self.assertEqual(state['value']['versions'],[{'version':15}])
            else:
                returned.assert_not_called()
                self.assertEqual(receipt['status'],'published')
                self.assertTrue(receipt['private_backup_retained'])
                self.assertEqual((live/'version').read_text(),'new')
                ready.assert_called_once_with(config['files'])
            self.assertTrue((work/'objects-backup').is_dir())
            if failure!='migration': self.assertEqual((work/'previous/version').read_text(),'old')

    def test_success_retains_private_backup_and_old_release(self): self.check_failure_boundary(None)
    def test_preopening_failure_restores_old_schema_and_release(self): self.check_failure_boundary('migration')
    def test_postopening_failure_preserves_new_writes(self): self.check_failure_boundary('opened')

    def test_interrupted_receipt_prevents_repeat_activation(self):
        with tempfile.TemporaryDirectory() as directory:
            work=Path(directory)
            (work/'result.json').write_text('{"status":"maintenance"}')
            with patch.object(transition,'preflight'), patch.object(transition,'prepare_candidate') as prepare:
                with self.assertRaises(RuntimeError): transition.activate({},work)
                prepare.assert_not_called()

    def test_exact_reviewed_source_and_unchanged_runtime_are_required(self):
        with tempfile.TemporaryDirectory() as directory:
            old,new=Path(directory)/'old',Path(directory)/'new'
            previous={'src/old.ts':b'old','package-lock.json':b'lock','.nvmrc':b'24.14.0','package.json':b'{"engines":{"node":">=24.14.0 <25"},"scripts":{}}'}
            incoming=dict(previous,**{'src/old.ts':b'approved','package.json':b'{"engines":{"node":">=24.14.0 <25"},"scripts":{"check":"reviewed"}}'})
            for root,files in [(old,previous),(new,incoming)]:
                for name,value in files.items():
                    path=root/name;path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(value)
            exports={transition.BEFORE:previous,transition.REVIEWED:incoming}
            with patch.object(transition.backup_tools,'git_export',side_effect=lambda r:exports[r]),patch.object(base,'run',return_value=b'v24.18.1'):
                transition.reviewed_candidate(new,old)
                (new/'src/old.ts').write_bytes(b'unreviewed')
                with self.assertRaises(RuntimeError): transition.reviewed_candidate(new,old)
                (new/'src/old.ts').write_bytes(b'approved')
                (new/'package-lock.json').write_bytes(b'changed')
                with self.assertRaises(RuntimeError): transition.reviewed_candidate(new,old)


if __name__ == '__main__': unittest.main()
