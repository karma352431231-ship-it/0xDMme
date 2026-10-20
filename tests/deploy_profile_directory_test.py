"""Directory transition boundaries; synthetic snapshots without external effects."""
import contextlib
import io
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'infra/staging'))
import deploy
import deploy_profile_directory as directory
import deploy_remote as base


class ProfileDirectoryDeploymentTests(unittest.TestCase):
    def test_source_schema_and_unit_mismatches_refuse_before_maintenance(self):
        with (patch.object(base, 'reviewed_database', side_effect=RuntimeError('source differs')),
              patch.object(directory.ranking.capacity, 'psql') as sql,
              self.assertRaisesRegex(RuntimeError, 'source differs')):
            directory.review(Path('candidate'), Path('live'))
        sql.assert_not_called()
        for digests, schema in [(['new', 'old'], b't'), (['same'] * 8, b'f')]:
            with (patch.object(base, 'reviewed_database'),
                  patch.object(base, 'verify_community_tables'),
                  patch.object(base, 'digest', side_effect=digests),
                  patch.object(directory.ranking.capacity, 'psql', return_value=schema),
                  self.assertRaises(RuntimeError)):
                directory.review(Path('candidate'), Path('live'))
        with (patch.object(base, 'reviewed_database') as reviewed,
              patch.object(base, 'verify_community_tables'),
              patch.object(base, 'digest', return_value='same'),
              patch.object(directory.ranking.capacity, 'psql', return_value=b't')):
            directory.review(Path('candidate'), Path('live'))
        self.assertEqual(reviewed.call_args.args[2], {'before': directory.BEFORE,
            'reviewed': directory.REVIEWED, 'versions': 93, 'previous_versions': 92})

    def test_snapshot_excludes_only_derived_expiry_and_the_new_default_column(self):
        with (patch.object(directory.backups, 'database_snapshot', return_value={'tables': {}}) as snapshot,
              patch.object(directory.ranking.batches, 'snapshot', return_value={'message_changes': 'paged'})):
            self.assertEqual(directory.snapshot()['tables'], {'message_changes': 'paged'})
        small = tuple(name for name in directory.TABLES if name not in directory.ranking.batches.KEYS)
        snapshot.assert_called_once_with(small, omit_columns={
            'profile_ranking_entries': ('followers',),
            'community_ranking_generations': ('expires_at',)}, version_limit=93, include_reserved=True)
        for name in ['public_profiles', 'public_profile_follows', 'profile_ranking_state',
                     'community_ranking_cache_usage', 'content_usage_legacy', 'content_usage_partitions']:
            self.assertIn(name, small)

    def test_data_accounting_checksums_and_schema_must_reconcile(self):
        versions = list(range(1, 94))
        before = {'versions': versions[:92], 'tables': {'source': 'same', 'ledger': 'same'}}
        after = dict(before, versions=versions)
        for changed in [dict(after, versions=[]), dict(after, tables={}),
                        dict(after, tables={'source': 'same', 'ledger': 'changed'})]:
            with (patch.object(directory, 'snapshot', return_value=changed),
                  patch.object(base, 'attachment_versions', return_value=versions),
                  self.assertRaisesRegex(RuntimeError, 'existing data, accounting or applied history')):
                directory.verify_migration(Path('candidate'), before)
        for failed in range(3):
            checks = [b'f' if index == failed else b't' for index in range(3)]
            with (patch.object(directory, 'snapshot', return_value=after),
                  patch.object(base, 'attachment_versions', return_value=versions),
                  patch.object(base, 'verify_community_tables'),
                  patch.object(directory.ranking.capacity, 'psql', side_effect=checks),
                  self.assertRaisesRegex(RuntimeError, 'reconciliation failed')):
                directory.verify_migration(Path('candidate'), before)
        with (patch.object(directory, 'snapshot', return_value=after),
              patch.object(base, 'attachment_versions', return_value=versions),
              patch.object(base, 'verify_community_tables'),
              patch.object(directory.ranking.capacity, 'psql', return_value=b't')):
            directory.verify_migration(Path('candidate'), before)

    def test_routine_activation_cannot_apply_the_migration_without_explicit_opt_in(self):
        for config in [{}, {'profile_directory': False}, {'profile_directory': 'true'}, {'profile_directory': 1}]:
            with (patch.object(directory.background, 'verify_current') as workers,
                  patch.object(base, 'activate_database') as activate,
                  self.assertRaisesRegex(RuntimeError, 'explicit --profile-directory approval')):
                directory.activate(config, Path('work'), Path('candidate'), {})
            workers.assert_not_called()
            activate.assert_not_called()
        with (patch.object(directory.background, 'verify_current'),
              patch.object(directory.ranking.parts, 'require_workers', side_effect=RuntimeError('not ready')),
              patch.object(base, 'activate_database') as activate,
              self.assertRaisesRegex(RuntimeError, 'not ready')):
            directory.activate({'profile_directory': True}, Path('work'), Path('candidate'), {})
        activate.assert_not_called()

    def test_approved_transition_reuses_verified_backup_and_phase_aware_recovery(self):
        with (patch.object(directory.background, 'verify_current'),
              patch.object(directory.ranking.parts, 'require_workers'),
              patch.object(base, 'receipt'),
              patch.object(base, 'activate_database', return_value={'status': 'published'}) as activate):
            result = directory.activate({'profile_directory': True}, Path('work'), Path('candidate'), {})
        contract = activate.call_args.args[3]
        self.assertEqual(contract['versions'], 92)
        self.assertIs(contract['snapshot'], directory.snapshot)
        self.assertIs(contract['verify'], directory.verify_migration)
        self.assertIs(contract['stop_existing'], directory.background.stop)
        self.assertIs(contract['resume_existing'], directory.background.start)
        self.assertIs(contract['start'], directory.background.start)
        self.assertNotIn('install', contract)
        self.assertEqual(result['profile_directory_schema_versions'], 93)

    def test_cli_rejects_combining_the_migration_with_other_operational_changes(self):
        for other in ['--prepare', '--capacity', '--request-limit', '--media-worker', '--worker-boot']:
            arguments = ['deploy.py', '--check', '--profile-directory', other]
            if other == '--prepare':
                arguments.remove('--check')
            with (patch.object(sys, 'argv', arguments),
                  patch.object(deploy, 'shared_private_workspace'),
                  patch.object(deploy, 'repository') as repository,
                  contextlib.redirect_stderr(io.StringIO()),
                  self.assertRaises(SystemExit) as rejected):
                deploy.main()
            self.assertEqual(rejected.exception.code, 2)
            repository.assert_not_called()

    def test_check_transports_the_opt_in_without_activating(self):
        with (patch.object(sys, 'argv', ['deploy.py', '--check', '--profile-directory']),
              patch.object(deploy, 'shared_private_workspace'),
              patch.object(deploy, 'repository', return_value=('a' * 40, 'main')),
              patch.object(deploy, 'ci', return_value='synthetic-ci'),
              patch.object(deploy, 'prepare', return_value=({'commit': 'a' * 40}, Path('archive'))),
              patch.object(deploy, 'private_inputs', return_value=('synthetic-target', {})),
              patch.object(deploy, 'run'),
              patch.object(deploy, 'remote', return_value={}) as remote,
              patch('builtins.print')):
            deploy.main()
        self.assertEqual(remote.call_count, 1)
        self.assertEqual(remote.call_args.args[0], 'check')
        self.assertIs(remote.call_args.args[1]['profile_directory'], True)
