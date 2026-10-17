"""Capacity release guards and failure recovery; no real SSH or service action."""

import copy
from contextlib import ExitStack
import hashlib
import json
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'infra/staging'))
import deploy_capacity_proxy as proxy
import deploy_capacity_database as capacity
import deploy_remote as base
import deploy_blocks45 as backups
import deploy


def configuration(path=proxy.PROXY):
    template = Path(__file__).resolve().parents[1] / proxy.TEMPLATE
    after = template.read_text()
    before = after.replace(proxy.TRUSTED, proxy.HOST)
    before = before.replace('\n\nserver {', '\n' + proxy.REMOVALS[0] + '\nserver {', 1)
    before = before.replace('    location / {\n', ''.join(proxy.REMOVALS[1:]) + '    location / {\n')
    proposal = {'path': str(path), 'old_content': before, 'new_content': after,
                'old_sha256': hashlib.sha256(before.encode()).hexdigest(),
                'new_sha256': hashlib.sha256(after.encode()).hexdigest()}
    return {'capacity': proposal, 'files': {proxy.TEMPLATE: proposal['new_sha256']}, 'baseline': {}}


class CapacityProxyTests(unittest.TestCase):
    def test_exact_template_only_preserves_abuse_body_and_origin_contracts(self):
        config = configuration()
        proposal = proxy.validate(config)
        self.assertIn('rate=30r/s;', proposal['new_content'])
        self.assertIn('burst=120', proposal['new_content'])
        self.assertIn('client_max_body_size 8m;', proposal['new_content'])
        for field in ['path', 'old_sha256', 'new_sha256']:
            changed = copy.deepcopy(config); changed['capacity'][field] = 'unreviewed'
            with self.subTest(field=field), self.assertRaises(RuntimeError):
                proxy.validate(changed)
        changed = copy.deepcopy(config)
        changed['capacity']['new_content'] = proposal['new_content'].replace('30r/s', '100r/s')
        changed['capacity']['new_sha256'] = hashlib.sha256(changed['capacity']['new_content'].encode()).hexdigest()
        changed['files'][proxy.TEMPLATE] = changed['capacity']['new_sha256']
        with self.assertRaisesRegex(RuntimeError, 'exceeds'):
            proxy.validate(changed)
        with self.assertRaisesRegex(RuntimeError, 'required'):
            proxy.validate({'files': config['files']})
        changed = copy.deepcopy(config); changed['files'][proxy.TEMPLATE] = 'a' * 64
        with self.assertRaises(RuntimeError): proxy.validate(changed)

    def test_changed_oversized_and_linked_proxy_paths_refuse(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'own.conf'
            config = configuration(path)
            with patch.object(proxy, 'PROXY', path):
                path.write_text(config['capacity']['old_content'])
                proxy.review(config)
                path.write_text('changed')
                with self.assertRaisesRegex(RuntimeError, 'changed'): proxy.review(config)
                path.unlink(); target = Path(directory) / 'target'; target.write_text(config['capacity']['old_content']); path.symlink_to(target)
                with self.assertRaisesRegex(RuntimeError, 'changed'): proxy.review(config)
                path.unlink(); path.write_text('x' * (proxy.MAX_CONFIG + 1))
                with self.assertRaisesRegex(RuntimeError, 'changed'): proxy.review(config)

    def test_install_and_return_keep_exact_original_bytes_and_only_expected_state(self):
        with tempfile.TemporaryDirectory() as directory:
            work = Path(directory); path = work / 'own.conf'; config = configuration(path)
            path.write_text(config['capacity']['old_content'])
            before = {'files': {str(path): config['capacity']['old_sha256'], 'unrelated': 'fixed'}, 'postgres': 'fixed'}
            state = lambda: dict(before, files=dict(before['files'], **{str(path): base.digest(path)}))
            with (patch.object(proxy, 'PROXY', path), patch.object(proxy.requests, 'PROXY', path),
                  patch.object(base, 'run') as command, patch.object(base, 'preservation'),
                  patch.object(base, 'own_state', side_effect=state)):
                self.assertEqual(proxy.install(config, work, before), proxy.expected_state(config, before))
                self.assertEqual(path.read_text(), config['capacity']['new_content'])
                backup = work / 'capacity-proxy-before.conf'
                self.assertEqual(backup.read_text(), config['capacity']['old_content'])
                self.assertEqual(backup.stat().st_mode & 0o777, 0o600)
                proxy.restore(config, before)
                self.assertEqual(path.read_text(), config['capacity']['old_content'])
                self.assertEqual(command.call_args_list[0].args[0], ['nginx', '-t'])
                self.assertEqual(command.call_args_list[1].args[0], ['systemctl', 'reload', 'nginx'])
                self.assertFalse(any('restart' in call.args[0] for call in command.call_args_list))

    def test_unrelated_own_configuration_change_never_reports_success(self):
        with tempfile.TemporaryDirectory() as directory:
            work = Path(directory); path = work / 'own.conf'; config = configuration(path)
            path.write_text(config['capacity']['old_content'])
            with (patch.object(proxy, 'PROXY', path), patch.object(proxy.requests, 'PROXY', path),
                  patch.object(base, 'run'), patch.object(base, 'preservation'),
                  patch.object(base, 'own_state', return_value={'unexpected': True}),
                  self.assertRaisesRegex(RuntimeError, 'unrelated')):
                proxy.install(config, work, {'files': {}})


class CapacityDatabaseTests(unittest.TestCase):
    def test_exact_schema_dispatch_is_not_a_generic_migration_bypass(self):
        with tempfile.TemporaryDirectory() as directory:
            candidate = Path(directory); migrations = candidate / 'src/server/database/migrations'; migrations.mkdir(parents=True)
            for number in range(1, 91): (migrations / f'{number:03d}.sql').write_text('-- synthetic')
            with patch.object(capacity, 'review') as reviewed:
                base.database_review(candidate, Path('live'))
                reviewed.assert_called_once_with(candidate, Path('live'))
        with (patch.object(capacity, 'REVIEWED', 'UNREVIEWED'), patch.object(base, 'reviewed_database') as gate,
              self.assertRaisesRegex(RuntimeError, 'exact source')):
            capacity.review(Path('candidate'), Path('live'))
        gate.assert_not_called()

    def test_review_pins_both_source_trees_all_90_sql_and_unchanged_units(self):
        with (patch.object(base, 'reviewed_database') as source, patch.object(base, 'verify_community_tables') as tables,
              patch.object(base, 'digest', return_value='same'), patch.object(capacity, 'volume_review') as volume):
            capacity.review(Path('candidate'), Path('live'))
            self.assertEqual(source.call_args.args[2], {'before': capacity.BEFORE, 'reviewed': capacity.REVIEWED, 'versions': 90, 'previous_versions': 72})
            tables.assert_called_once_with(capacity.OLD_TABLES); volume.assert_called_once()
        with (patch.object(base, 'reviewed_database'), patch.object(base, 'verify_community_tables'),
              patch.object(base, 'digest', side_effect=['incoming', 'live']), self.assertRaisesRegex(RuntimeError, 'unit changes')):
            capacity.review(Path('candidate'), Path('live'))

    def test_snapshot_preserves_content_usage_projection_and_all_versions(self):
        with patch.object(backups, 'database_snapshot', return_value={}) as snapshot:
            capacity.snapshot()
            snapshot.assert_called_once_with(capacity.OLD_TABLES, version_limit=90)
        self.assertIn('content_usage', capacity.OLD_TABLES)
        self.assertNotIn('content_usage', capacity.TABLES)
        self.assertIn('content_usage_legacy', capacity.TABLES)
        self.assertEqual(len(set(capacity.TABLES)), len(capacity.TABLES))

    def test_source_digests_checksums_and_counter_mismatch_refuse_release(self):
        versions = list(range(90)); before = {'tables': {'source': 'digest'}, 'versions': versions[:72]}; after = dict(before, versions=versions)
        for changed in [dict(after, tables={}), dict(after, versions=versions[:89])]:
            with (patch.object(capacity, 'snapshot', return_value=changed), patch.object(base, 'attachment_versions', return_value=versions),
                  patch.object(capacity, 'psql') as query, self.assertRaises(RuntimeError)):
                capacity.verify_migration(Path('candidate'), before)
            query.assert_not_called()
        with (patch.object(capacity, 'snapshot', return_value=after), patch.object(base, 'attachment_versions', return_value=versions),
              patch.object(base, 'verify_community_tables'), patch.object(capacity, 'psql', side_effect=[b't', b'f']),
              self.assertRaisesRegex(RuntimeError, 'counters')):
            capacity.verify_migration(Path('candidate'), before)
        with (patch.object(capacity, 'snapshot', return_value=after), patch.object(base, 'attachment_versions', return_value=versions),
              patch.object(base, 'verify_community_tables'), patch.object(capacity, 'psql', return_value=b't')):
            capacity.verify_migration(Path('candidate'), before)

    def test_missing_proxy_approval_stops_before_any_writer_or_sql_effect(self):
        with (patch.object(base, 'activate_database') as activate, patch.object(capacity.background, 'verify_current') as workers,
              self.assertRaises(RuntimeError)):
            capacity.activate({}, Path('work'), Path('candidate'), {})
        activate.assert_not_called(); workers.assert_not_called()

    def test_coupled_proxy_hooks_keep_existing_worker_and_data_recovery_contract(self):
        config = configuration(); before = {'files': {}}
        with (patch.object(proxy, 'review'), patch.object(capacity.background, 'verify_current'),
              patch.object(base, 'activate_database', return_value={'status': 'published'}) as activate,
              patch.object(base, 'receipt') as receipt, patch.object(proxy, 'install') as install, patch.object(proxy, 'restore') as restore):
            result = capacity.activate(config, Path('work'), Path('candidate'), before)
            contract = activate.call_args.args[3]
            self.assertEqual(contract['versions'], 72)
            self.assertIs(contract['stop_existing'], capacity.background.stop)
            self.assertIs(contract['resume_existing'], capacity.background.start)
            self.assertIs(contract['start'], capacity.background.start)
            contract['install'](); contract['uninstall']()
            install.assert_called_once_with(config, Path('work'), before); restore.assert_called_once_with(config, before)
            self.assertEqual(result['capacity_proxy_before_sha256'], config['capacity']['old_sha256'])
            receipt.assert_called_once_with(Path('work'), result)


class CapacityRecoveryTests(unittest.TestCase):
    def exercise(self, failure):
        with tempfile.TemporaryDirectory() as directory, ExitStack() as patches:
            root = Path(directory); work = root / 'work'; work.mkdir()
            live = root / 'release'; live.mkdir(); (live / 'version').write_text('old')
            candidate = root / 'candidate'; candidate.mkdir(); (candidate / 'version').write_text('new')
            path = root / 'own.conf'; config = configuration(path); config['commit'] = 'a' * 40
            path.write_text(config['capacity']['old_content'])
            before_state = {'files': {str(path): config['capacity']['old_sha256']}, 'postgres': 'unchanged'}
            versions = list(range(90)); before = {'tables': {'source': 'digest'}, 'versions': versions[:72]}
            status = SimpleNamespace(schema=before, nginx_failed=False)
            def snapshot(): return status.schema
            def backup(_work): (work / 'objects-backup').mkdir(); return 'checksum'
            def migrate(_candidate): status.schema = dict(before, versions=versions)
            def restore(*args, **kwargs): status.schema = before
            def own_state(): return dict(before_state, files={str(path): base.digest(path)})
            def command(args, **kwargs):
                if args == ['nginx', '-t'] and failure == 'before-opening' and not status.nginx_failed:
                    status.nginx_failed = True; raise RuntimeError('Synthetic proxy verification failure.')
                return b'0' if 'MainPID' in ' '.join(args) else b''
            def ready(files=None):
                if files is not None and failure == 'after-opening': raise RuntimeError('Synthetic post-opening failure.')
            values = [(base, 'DATA', root), (proxy, 'PROXY', path), (proxy.requests, 'PROXY', path)]
            for owner, name, value in values: patches.enter_context(patch.object(owner, name, value))
            mocks = [(base, 'run', command), (base, 'own_state', own_state), (base, 'preservation', lambda _: None),
                     (base, 'wait_ready', ready), (base, 'attachment_versions', lambda _: versions),
                     (capacity, 'review', lambda *_: None), (capacity, 'snapshot', snapshot),
                     (base, 'verify_community_tables', lambda _: None), (capacity, 'psql', lambda _: b't'),
                     (backups, 'own_free_bytes', lambda: 10**12), (backups, 'required_backup_space', lambda: 1),
                     (backups, 'backup', backup), (backups, 'objects_snapshot', lambda: {}),
                     (backups, 'validate_restore', lambda *args, **kwargs: None), (backups, 'migrate', migrate),
                     (capacity.background, 'verify_current', lambda _: None), (capacity.background, 'stop', lambda: None),
                     (capacity.background, 'start', lambda: None)]
            for owner, name, function in mocks: patches.enter_context(patch.object(owner, name, side_effect=function))
            restored = patches.enter_context(patch.object(backups, 'restore', side_effect=restore))
            with self.assertRaises(RuntimeError): capacity.activate(config, work, candidate, before_state)
            receipt = json.loads((work / 'result.json').read_text())
            if failure == 'before-opening':
                restored.assert_called_once()
                self.assertEqual(path.read_text(), config['capacity']['old_content'])
                self.assertEqual((live / 'version').read_text(), 'old')
                self.assertTrue(receipt['rollback_verified'])
                self.assertFalse(receipt['new_state_preserved'])
            else:
                restored.assert_not_called()
                self.assertEqual(path.read_text(), config['capacity']['new_content'])
                self.assertEqual((live / 'version').read_text(), 'new')
                self.assertTrue(receipt['new_state_preserved'])
                self.assertFalse(receipt['rollback_verified'])

    def test_proxy_failure_before_opening_restores_sql_release_and_proxy(self): self.exercise('before-opening')
    def test_failure_after_opening_preserves_new_sql_release_and_proxy(self): self.exercise('after-opening')


if __name__ == '__main__': unittest.main()
