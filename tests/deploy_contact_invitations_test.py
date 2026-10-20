"""Invitation release guards, including the existing backup/recovery contract."""
import contextlib
import io
from pathlib import Path
import sys
import unittest
import subprocess
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'infra/staging'))
import deploy
import deploy_contact_invitations as invitations
import deploy_remote as base


class ContactInvitationDeploymentTests(unittest.TestCase):
    def test_migration_executor_loads_within_the_original_transport_budget(self):
        root = Path(__file__).resolve().parents[1]
        files = {'infra/staging/' + path.name: base.digest(path)
                 for path in (root / 'infra/staging').glob('deploy_*.py')}
        code = deploy.executor_code({'files': files, 'contact_invitations': True})
        safe = code.rsplit('print(json.dumps', 1)[0]
        safe += 'assert callable(sys.modules["deploy_contact_invitations"].activate)\n'
        safe += 'assert "deploy_worker_boot" not in sys.modules\n'
        subprocess.run([sys.executable, '-c', safe], check=True, capture_output=True, timeout=10)
        self.assertLess(len(code.encode()), 64 * 1024)

    def state(self, *, after=False):
        return {'versions': list(range(1, 95 if after else 94)),
                'tables': {'contacts': 'preserved', 'private_content': 'preserved'},
                'controls': {'count': 3, 'hash': 'normalized controls'},
                'grants': {'count': 2, 'hash': 'same grants'},
                'present': after, 'ledger': '1512' if after else '1000'}

    def test_review_pins_database_sources_and_refuses_unit_or_schema_drift(self):
        with (patch.object(base, 'reviewed_database') as reviewed,
              patch.object(base, 'verify_community_tables'),
              patch.object(base, 'digest', return_value='same'),
              patch.object(invitations.directory.ranking.capacity, 'psql', return_value=b't')):
            invitations.review(Path('candidate'), Path('live'))
        self.assertEqual(reviewed.call_args.args[2], {'before': invitations.BEFORE,
            'reviewed': invitations.REVIEWED, 'versions': 94, 'previous_versions': 93})
        for digests, schema in [(['changed', 'old'], b't'), (['same'] * 8, b'f')]:
            with (patch.object(base, 'reviewed_database'),
                  patch.object(base, 'verify_community_tables'),
                  patch.object(base, 'digest', side_effect=digests),
                  patch.object(invitations.directory.ranking.capacity, 'psql', return_value=schema),
                  self.assertRaises(RuntimeError)):
                invitations.review(Path('candidate'), Path('live'))

    def test_preservation_detects_changed_controls_grants_history_or_wrong_charge(self):
        before, after = self.state(), self.state(after=True)
        changed = [dict(after, tables={}), dict(after, controls={}), dict(after, grants={}),
                   dict(after, versions=[]), dict(after, present=False), dict(after, ledger='1513')]
        for value in changed:
            with (patch.object(invitations, 'snapshot', return_value=value),
                  patch.object(base, 'attachment_versions', return_value=after['versions']),
                  self.assertRaises(RuntimeError)):
                invitations.verify_migration(Path('candidate'), before)
        with (patch.object(invitations, 'snapshot', return_value=after),
              patch.object(base, 'attachment_versions', return_value=after['versions']),
              patch.object(base, 'verify_community_tables'),
              patch.object(invitations.directory.ranking.capacity, 'psql', return_value=b't')):
            invitations.verify_migration(Path('candidate'), before)
        with (patch.object(invitations, 'snapshot', return_value=after),
              patch.object(base, 'attachment_versions', return_value=after['versions']),
              patch.object(base, 'verify_community_tables'),
              patch.object(invitations.directory.ranking.capacity, 'psql', return_value=b'f'),
              self.assertRaisesRegex(RuntimeError, 'reconciliation')):
            invitations.verify_migration(Path('candidate'), before)

    def test_activation_requires_explicit_approval_and_reuses_phase_aware_backup(self):
        for config in [{}, {'contact_invitations': False}, {'contact_invitations': 1}]:
            with (patch.object(base, 'activate_database') as activate,
                  self.assertRaisesRegex(RuntimeError, 'explicit --contact-invitations approval')):
                invitations.activate(config, Path('work'), Path('candidate'), {})
            activate.assert_not_called()
        with (patch.object(invitations.background, 'verify_current'),
              patch.object(invitations.directory.ranking.parts, 'require_workers'),
              patch.object(base, 'receipt'),
              patch.object(base, 'activate_database', return_value={'status': 'published'}) as activate):
            result = invitations.activate({'contact_invitations': True}, Path('work'), Path('candidate'), {})
        contract = activate.call_args.args[3]
        self.assertEqual(contract['versions'], 93)
        self.assertIs(contract['snapshot'], invitations.snapshot)
        self.assertIs(contract['verify'], invitations.verify_migration)
        self.assertIs(contract['stop_existing'], invitations.background.stop)
        self.assertIs(contract['resume_existing'], invitations.background.start)
        self.assertEqual(result['contact_invitation_schema_versions'], 94)

    def test_cli_does_not_combine_this_migration_with_other_operational_changes(self):
        for other in ['--prepare', '--profile-directory', '--capacity', '--request-limit', '--media-worker', '--worker-boot']:
            args = ['deploy.py', '--contact-invitations', other]
            if other != '--prepare':
                args.append('--check')
            with (patch.object(sys, 'argv', args),
                  patch.object(deploy, 'shared_private_workspace'),
                  patch.object(deploy, 'repository') as repository,
                  contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit)):
                deploy.main()
            repository.assert_not_called()

    def test_check_transports_approval_without_activation(self):
        with (patch.object(sys, 'argv', ['deploy.py', '--check', '--contact-invitations']),
              patch.object(deploy, 'shared_private_workspace'),
              patch.object(deploy, 'repository', return_value=('a' * 40, 'main')),
              patch.object(deploy, 'ci', return_value='synthetic-ci'),
              patch.object(deploy, 'prepare', return_value=({'commit': 'a' * 40}, Path('archive'))),
              patch.object(deploy, 'private_inputs', return_value=('synthetic-target', {})),
              patch.object(deploy, 'run'), patch.object(deploy, 'remote', return_value={}) as remote,
              patch('builtins.print')):
            deploy.main()
        self.assertEqual(remote.call_count, 1)
        self.assertEqual(remote.call_args.args[0], 'check')
        self.assertIs(remote.call_args.args[1]['contact_invitations'], True)
