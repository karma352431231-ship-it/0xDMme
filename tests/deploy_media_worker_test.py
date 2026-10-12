"""Exact media release scope and rollback; no SSH or real service restart."""
from contextlib import ExitStack
import hashlib
import io
import json
from pathlib import Path
import shlex
import sys
import tarfile
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'infra/staging'))
import deploy_media_worker as media
import deploy_remote as base
import deploy_blocks45 as backups
import deploy


class MediaReleaseTests(unittest.TestCase):
    def fixture(self, root, stack):
        unit, dropin, legacy, store = root/'media.service', root/'media.service.d/60-code-release.conf', root/'old.mjs', root/'bundles'
        unit.write_text('reviewed own base service')
        legacy.write_bytes(b'old canonical worker')
        candidate = b'new canonical worker'
        checksum = hashlib.sha256(candidate).hexdigest()
        for name, value in [('UNIT_FILE',unit),('DROPIN',dropin),('LEGACY',legacy),('ROOT',store)]:
            stack.enter_context(patch.object(media,name,value))
        archive_path = root/'build.tar.gz'
        with tarfile.open(archive_path,'w:gz') as archive:
            item = tarfile.TarInfo(media.BUNDLE); item.size=len(candidate)
            archive.addfile(item,io.BytesIO(candidate))
        config = {'media_worker':{'before_unit':base.digest(unit),'before_dropin':None,
                                 'before_worker':base.digest(legacy),'candidate_worker':checksum},
                  'files':{media.BUNDLE:checksum},'archive_sha256':base.digest(archive_path),'baseline':{}}
        def own():
            files = {str(unit):base.digest(unit),'unrelated-own.conf':'unchanged'}
            if dropin.exists(): files[str(dropin)]=base.digest(dropin)
            return {'files':files,'postgres':'unchanged-pid'}
        stack.enter_context(patch.object(base,'own_state',side_effect=own))
        stack.enter_context(patch.object(base,'preservation'))
        stack.enter_context(patch.object(backups,'pg',return_value=b'0\n'))
        stack.enter_context(patch.object(media,'handshake'))
        return config, dropin, legacy, store

    def test_success_is_immutable_scoped_and_idempotent(self):
        with tempfile.TemporaryDirectory() as directory, ExitStack() as stack:
            root=Path(directory); config,dropin,legacy,store=self.fixture(root,stack)
            calls=stack.enter_context(patch.object(base,'run'))
            with media.activation(config,root) as proof:
                self.assertTrue(proof['updated'])
                self.assertEqual(dropin.read_bytes(),media.contents(store/config['files'][media.BUNDLE]))
            self.assertEqual(calls.call_args_list[1].args[0],['systemctl','restart','0xdmme-media.service'])
            self.assertEqual(len(calls.call_args_list),2)
            self.assertEqual(legacy.read_bytes(),b'old canonical worker')
            with media.activation(config,root): pass
            self.assertEqual(len(calls.call_args_list),2)

    def test_failed_worker_or_later_web_activation_restores_old_worker(self):
        for failure in ['worker','web']:
            with self.subTest(failure=failure), tempfile.TemporaryDirectory() as directory, ExitStack() as stack:
                root=Path(directory); config,dropin,legacy,store=self.fixture(root,stack)
                effects=[None,RuntimeError('synthetic restart failure'),None,None] if failure=='worker' else None
                calls=stack.enter_context(patch.object(base,'run',side_effect=effects))
                with self.assertRaises(RuntimeError):
                    with media.activation(config,root):
                        raise RuntimeError('synthetic web failure')
                self.assertFalse(dropin.exists())
                self.assertEqual(legacy.read_bytes(),b'old canonical worker')
                restarts=[call.args[0] for call in calls.call_args_list if call.args[0][1]=='restart']
                self.assertEqual(restarts,[['systemctl','restart','0xdmme-media.service']]*2)

    def test_active_writer_or_changed_review_is_refused_before_configuration(self):
        for failure in ['busy','unit','worker','archive','candidate']:
            with self.subTest(failure=failure), tempfile.TemporaryDirectory() as directory, ExitStack() as stack:
                root=Path(directory); config,dropin,legacy,store=self.fixture(root,stack)
                calls=stack.enter_context(patch.object(base,'run'))
                if failure=='busy': stack.enter_context(patch.object(backups,'pg',return_value=b'1'))
                if failure=='unit': media.UNIT_FILE.write_text('unexpected')
                if failure=='worker': legacy.write_text('unexpected')
                if failure=='archive': (root/'build.tar.gz').write_text('unexpected')
                if failure=='candidate': config['media_worker']['candidate_worker']='f'*64
                with self.assertRaises(RuntimeError):
                    with media.activation(config,root): pass
                self.assertFalse(dropin.exists())
                calls.assert_not_called()

    def test_store_budget_and_unreviewed_dropin_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory, ExitStack() as stack:
            root=Path(directory); config,dropin,legacy,store=self.fixture(root,stack)
            with self.assertRaises(RuntimeError): media.previous_bundle(b'arbitrary command')
            for index in range(media.MAX_RETAINED):
                data=('worker'+str(index)).encode(); digest=hashlib.sha256(data).hexdigest()
                media.install(store/digest,data)
            data=b'one more'; digest=hashlib.sha256(data).hexdigest()
            with self.assertRaisesRegex(RuntimeError,'retained'): media.install(store/digest,data)
            self.assertEqual(len(list(store.iterdir())),media.MAX_RETAINED)

    def test_only_explicit_media_activation_writes_its_own_dropin(self):
        files={str(p.relative_to(Path(deploy.__file__).parent.parent.parent)):base.digest(p)
               for p in Path(deploy.__file__).parent.glob('deploy*.py')}
        with tempfile.TemporaryDirectory() as directory:
            local=Path(directory); revision='a'*40; (local/revision).mkdir()
            result=SimpleNamespace(returncode=0,stdout=b'{"verified":true}',stderr=b'')
            with patch.object(deploy,'LOCAL',local),patch.object(deploy.subprocess,'run',return_value=result) as run:
                for action, enabled in [('check',True),('activate',False),('activate',True)]:
                    config={'commit':revision,'files':files}
                    if enabled: config['media_worker']={}
                    deploy.remote(action,config,'synthetic-target')
                    command=shlex.split(run.call_args.args[0][-1])
                    writable=' '.join(x for x in command if x.startswith('ReadWritePaths='))
                    self.assertEqual(str(media.DROPIN.parent) in writable,action=='activate' and enabled)
                    self.assertNotIn('/etc/systemd/system ',writable)
                    self.assertIn('MemorySwapMax=0',command)
                    self.assertIn('RuntimeMaxSec=240',command)
