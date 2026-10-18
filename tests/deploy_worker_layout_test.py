"""Real temporary-path exchanges; root metadata guards are checked separately."""
import os
from pathlib import Path
import stat
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'infra/staging'))
import deploy_worker_layout as layout


class WorkerLayoutTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name).resolve()
        self.system, self.volume = self.root / 'system', self.root / 'volume'
        self.wants = self.system / 'multi-user.target.wants'
        self.wants.mkdir(parents=True)
        self.volume.mkdir()
        for unit in layout.UNITS:
            (self.volume / unit).write_text('reviewed bytes ' + unit)
            (self.system / unit).symlink_to(self.volume / unit)
            (self.wants / unit).symlink_to(self.volume / unit)
        # Unprivileged tests exchange actual files; no production guard is disabled.
        for target in [patch.object(layout.os, 'fchown'), patch.object(layout, 'root_metadata')]:
            target.start()
            self.addCleanup(target.stop)
        self.before = layout.snapshot(self.system, self.volume)

    def test_exact_root_layout_preserves_bytes_and_restores_all_six_links(self):
        layout.install(self.system, self.volume, self.before)
        self.assertEqual(layout.detect(self.system, self.volume), 'root')
        for unit in layout.UNITS:
            path = self.system / unit
            self.assertFalse(path.is_symlink())
            self.assertEqual(path.read_bytes(), (self.volume / unit).read_bytes())
            self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o644)
            self.assertEqual(str((self.wants / unit).readlink()), '../' + unit)
        layout.restore(self.system, self.volume, self.before)
        self.assertEqual(layout.detect(self.system, self.volume), 'volume')
        self.assertEqual(layout.snapshot(self.system, self.volume), self.before)
        self.assertEqual(len(list(self.system.rglob('*.worker-boot'))), 0)

    def test_mixed_layout_and_unreviewed_wants_are_refused(self):
        unit = layout.UNITS[0]
        layout.replace_definition(self.system / unit, (self.volume / unit).read_bytes())
        layout.replace_link(self.wants / unit, '../' + unit)
        with self.assertRaisesRegex(RuntimeError, 'mixed state'):
            layout.detect(self.system, self.volume)
        layout.restore(self.system, self.volume, self.before)
        layout.replace_link(self.wants / unit, '/unreviewed')
        with self.assertRaisesRegex(RuntimeError, 'wants layout'):
            layout.detect(self.system, self.volume)

    def test_partial_exchange_failure_returns_exact_legacy_layout(self):
        original = layout.replace_link
        def fail_second(path, target):
            if path.name == layout.UNITS[1]:
                raise OSError('synthetic exchange failure')
            original(path, target)
        with patch.object(layout, 'replace_link', side_effect=fail_second):
            with self.assertRaises(OSError):
                layout.install(self.system, self.volume, self.before)
        layout.restore(self.system, self.volume, self.before)
        self.assertEqual(layout.snapshot(self.system, self.volume), self.before)

    def test_rollback_prevalidates_every_path_before_overwriting_an_edit(self):
        layout.install(self.system, self.volume, self.before)
        (self.system / layout.UNITS[-1]).write_text('unexpected administrator edit')
        with self.assertRaisesRegex(RuntimeError, 'bytes changed'):
            layout.restore(self.system, self.volume, self.before)
        self.assertFalse((self.system / layout.UNITS[0]).is_symlink())

    def test_changed_original_or_path_is_refused_before_first_exchange(self):
        (self.volume / layout.UNITS[0]).write_text('unreviewed original')
        with self.assertRaisesRegex(RuntimeError, 'changed before exchange'):
            layout.install(self.system, self.volume, self.before)
        self.assertTrue(all((self.system / unit).is_symlink() for unit in layout.UNITS))

    def test_existing_temporary_path_is_never_overwritten_or_removed(self):
        path = self.system / layout.UNITS[0]
        temporary = path.with_name('.' + path.name + '.worker-boot')
        temporary.write_text('preserve')
        for operation in [lambda: layout.replace_definition(path, b'new'),
                          lambda: layout.replace_link(path, '/new')]:
            with self.assertRaises(FileExistsError):
                operation()
            self.assertEqual(temporary.read_text(), 'preserve')
            self.assertTrue(path.is_symlink())


class RootMetadataTests(unittest.TestCase):
    def test_only_unshared_root_owned_0644_regular_file_on_root_device_is_accepted(self):
        values = dict(st_mode=stat.S_IFREG | 0o644, st_uid=0, st_gid=0, st_nlink=1, st_dev=7)
        layout.root_metadata(SimpleNamespace(**values), 7)
        for key, value in [('st_mode', stat.S_IFREG | 0o666), ('st_mode', stat.S_IFLNK | 0o644),
                           ('st_uid', 501), ('st_gid', 20), ('st_nlink', 2), ('st_dev', 8)]:
            with self.subTest(key=key, value=value), self.assertRaises(RuntimeError):
                layout.root_metadata(SimpleNamespace(**dict(values, **{key: value})), 7)


if __name__ == '__main__':
    unittest.main()
