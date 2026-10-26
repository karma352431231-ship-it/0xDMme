"""First-install inspection must never accept an existing application target."""

import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'infra/staging'))
import deploy_bootstrap as bootstrap


class BootstrapTests(unittest.TestCase):
    def test_refuses_existing_release_database_objects_and_repository(self):
        with tempfile.TemporaryDirectory() as temporary:
            data = Path(temporary)
            bootstrap.verify_empty(data)
            for name in ['release', 'postgres', 'objects', 'git']:
                path = data / name; path.mkdir()
                with self.subTest(name=name), self.assertRaises(RuntimeError): bootstrap.verify_empty(data)
                path.rmdir(); path.symlink_to(data / 'missing')
                with self.assertRaises(RuntimeError): bootstrap.verify_empty(data)
                path.unlink()

    def test_refuses_shared_filesystem_symlink_or_missing_mount_restrictions(self):
        with tempfile.TemporaryDirectory() as temporary:
            data = Path(temporary)
            with patch.object(bootstrap, 'DATA', data), patch.object(bootstrap.os, 'geteuid', return_value=0):
                for options in ['rw,nodev,nosuid', 'rw,nodev,nosuid,noexec']:
                    mounts = json.dumps({'filesystems': [{'target': str(data), 'options': options}]}).encode()
                    with patch.object(bootstrap.subprocess, 'check_output', return_value=mounts), self.assertRaises(RuntimeError):
                        bootstrap.inspect_target()
                alias = data / 'alias'; alias.symlink_to(data)
                with patch.object(bootstrap, 'DATA', alias), self.assertRaises(RuntimeError): bootstrap.inspect_target()
