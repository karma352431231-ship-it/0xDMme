"""Exact npm runtime transport and extraction boundaries, without SSH/install."""

import base64
import hashlib
import io
import json
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'infra/staging'))
import deploy_runtime as runtime

ROOT = Path(__file__).resolve().parents[1]


class RuntimeTests(unittest.TestCase):
    def candidate(self, directory):
        root = Path(directory)
        (root/'dist').mkdir();(root/'node_modules').mkdir()
        (root/'package-lock.json').write_bytes((ROOT/'package-lock.json').read_bytes())
        return root

    def archive(self, entries):
        buffer=io.BytesIO()
        with tarfile.open(fileobj=buffer,mode='w:gz') as archive:
            for name, data, kind in entries:
                item=tarfile.TarInfo(name);item.type=kind
                if kind==tarfile.REGTYPE: item.size=len(data)
                else: item.linkname='../../outside'
                archive.addfile(item,io.BytesIO(data) if item.isfile() else None)
        return buffer.getvalue()

    def test_original_runtime_closure_installs_and_loads_without_npm_or_network(self):
        with tempfile.TemporaryDirectory() as directory:
            root=self.candidate(directory)
            runtime.stage(root,Path.home()/'.npm/_cacache')
            self.assertEqual(len(list((root/'dist/runtime').iterdir())),17)
            runtime.install(root)
            command=subprocess.run(['node','-e',
                'const p=require(process.argv[1]); if(!p.generateVAPIDKeys().publicKey) process.exit(1);',
                str(root/'node_modules/web-push')],capture_output=True,timeout=15)
            self.assertEqual(command.returncode,0,command.stderr.decode())
            self.assertLess(sum(p.stat().st_size for p in (root/'node_modules').rglob('*') if p.is_file()),runtime.MAX_TOTAL)
            self.assertTrue((root/'node_modules/web-push/LICENSE').is_file())

    def test_unknown_locks_missing_packages_and_modified_archive_stop_before_install(self):
        with tempfile.TemporaryDirectory() as directory:
            root=self.candidate(directory)
            with self.assertRaisesRegex(RuntimeError,'archives absent'): runtime.install(root)
            runtime.stage(root,Path.home()/'.npm/_cacache')
            path=root/'dist/runtime/web-push.tgz';path.write_bytes(b'changed')
            with self.assertRaisesRegex(RuntimeError,'integrity'): runtime.install(root)
            self.assertEqual(list((root/'node_modules').iterdir()),[])
            (root/'package-lock.json').write_text('{}')
            with self.assertRaisesRegex(RuntimeError,'exact review'): runtime.install(root)

    def test_archive_traversal_links_native_files_and_conflicting_aliases_are_rejected(self):
        for entries in [
            [('package/../../outside',b'bad',tarfile.REGTYPE)],
            [('package/link',b'',tarfile.SYMTYPE)],
            [('package/addon.node',b'native',tarfile.REGTYPE)],
            [('package/a',b'one',tarfile.REGTYPE),('package/a',b'two',tarfile.REGTYPE)],
            [('package/./dist/index.js',b'one',tarfile.REGTYPE),('package/dist/index.js',b'two',tarfile.REGTYPE)],
        ]:
            with self.subTest(entries=entries), tarfile.open(fileobj=io.BytesIO(self.archive(entries))) as archive:
                with self.assertRaises(RuntimeError): runtime.package_members(archive)
        entries=[('package/./dist/index.js',b'same',tarfile.REGTYPE),('package/dist/index.js',b'same',tarfile.REGTYPE)]
        with tarfile.open(fileobj=io.BytesIO(self.archive(entries))) as archive:
            self.assertEqual(len(runtime.package_members(archive)),1)

    def test_install_hooks_or_platform_restrictions_are_not_executed(self):
        for extra in [{'scripts':{'install':'touch outside'}},{'os':['darwin']},{'cpu':['arm64']}]:
            data=json.dumps(dict(name='example',version='1.0.0',**extra)).encode()
            blob=self.archive([('package/package.json',data,tarfile.REGTYPE)])
            with self.assertRaises(RuntimeError): runtime.inspect_package(blob,'example',{'version':'1.0.0'})

    def test_integrity_and_resource_bounds(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'archive';path.write_bytes(b'original')
            entry={'integrity':'sha512-'+base64.b64encode(hashlib.sha512(b'original').digest()).decode()}
            self.assertEqual(runtime.verified_blob(path,entry),b'original')
            path.unlink();path.symlink_to(ROOT/'package-lock.json')
            with self.assertRaises(RuntimeError): runtime.verified_blob(path,entry)
        blob=self.archive([('package/large',b'x'*(runtime.MAX_PACKAGE+1),tarfile.REGTYPE)])
        with tarfile.open(fileobj=io.BytesIO(blob)) as archive:
            with self.assertRaises(RuntimeError):runtime.package_members(archive)


if __name__ == '__main__':
    unittest.main()
