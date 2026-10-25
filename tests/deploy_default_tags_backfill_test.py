"""Default post tags use one exact, backed-up 099→100 release transition."""
import contextlib
import io
import json
from pathlib import Path
import subprocess
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'infra/staging'))
import deploy
import deploy_default_tags_backfill as tags
import deploy_remote as base

ROOT = Path(__file__).resolve().parents[1]


def state(defaults=10, missing=0, preserved='rows', changed=None):
    tables = {'community_tags': 'tags', 'content_usage_legacy': 'ledger', 'quota': 'same'}
    tables.update(changed or {})
    return {'versions': list(range(1, 101)), 'tables': tables,
            'default_tags': {'preserved': preserved, 'defaults': defaults, 'missing': missing}}


class DefaultTagsDeploymentTests(unittest.TestCase):
    def test_reviewed_labels_match_the_migration_and_shared_defaults(self):
        sql = (ROOT / 'src/server/database/migrations/100-default-post-tags-backfill.sql').read_text()
        inserted = [label.lower() for label in __import__('re').findall(r"\('([A-Za-z]+)'\)", sql)]
        self.assertEqual(tuple(inserted), tags.LABELS)

    def test_executor_loads_its_explicit_contract_inside_existing_budgets(self):
        files = {'infra/staging/' + path.name: base.digest(path)
                 for path in (ROOT / 'infra/staging').glob('deploy_*.py')}
        code = deploy.executor_code({'files': files, 'default_tags': True})
        safe = code.rsplit('print(json.dumps', 1)[0]
        safe += 'assert callable(sys.modules["deploy_default_tags_backfill"].activate)\n'
        safe += 'assert "deploy_worker_boot" not in sys.modules\n'
        subprocess.run([sys.executable, '-c', safe], check=True, capture_output=True, timeout=10)
        self.assertLess(len(code.encode()), 64 * 1024)
        ordinary = deploy.executor_code({'files': files})
        self.assertNotIn('deploy_default_tags_backfill', ordinary.rsplit('print(json.dumps', 1)[0])

    def test_review_pins_both_complete_sources_and_rejects_unit_or_accounting_drift(self):
        sql = tags.previous.directory.ranking.capacity
        with (patch.object(base, 'reviewed_database') as reviewed,
              patch.object(base, 'verify_community_tables'),
              patch.object(base, 'digest', return_value='same'),
              patch.object(sql, 'psql', return_value=b't')):
            tags.review(Path('candidate'), Path('live'))
        self.assertEqual(reviewed.call_args.args[2], {'before': tags.BEFORE,
            'reviewed': tags.REVIEWED, 'versions': 100, 'previous_versions': 99})
        for digests, check in [(['changed', 'old'], b't'), (['same'] * 8, b'f')]:
            with (patch.object(base, 'reviewed_database'),
                  patch.object(base, 'verify_community_tables'),
                  patch.object(base, 'digest', side_effect=digests),
                  patch.object(sql, 'psql', return_value=check), self.assertRaises(RuntimeError)):
                tags.review(Path('candidate'), Path('live'))

    def test_metrics_accept_only_the_exact_shape(self):
        sql = tags.previous.directory.ranking.capacity
        good = {'preserved': 'abc', 'defaults': 3, 'missing': 5}
        with patch.object(sql, 'psql', return_value=json.dumps(good).encode()):
            self.assertEqual(tags.metrics(), good)
        for bad in [dict(good, missing=-1), dict(good, defaults='3'), {'preserved': 'abc'},
                    dict(good, extra=1)]:
            with (patch.object(sql, 'psql', return_value=json.dumps(bad).encode()),
                  self.assertRaisesRegex(RuntimeError, 'malformed')):
                tags.metrics()

    def test_only_missing_tags_and_their_charge_may_change(self):
        before = dict(state(defaults=10, missing=6), versions=list(range(1, 100)))
        accepted = state(defaults=16, changed={'community_tags': 'more', 'content_usage_legacy': 'charged'})
        refused = {
            'other table': state(defaults=16, changed={'quota': 'changed'}),
            'missing table': dict(accepted, tables={'community_tags': 'more'}),
            'history': dict(accepted, versions=[]),
            'preserved rows': state(defaults=16, preserved='edited'),
            'wrong count': state(defaults=15),
            'community left out': state(defaults=16, missing=1),
        }
        capacity = tags.previous.directory.ranking.capacity
        with (patch.object(tags, 'snapshot', return_value=accepted),
              patch.object(base, 'attachment_versions', return_value=accepted['versions']),
              patch.object(base, 'verify_community_tables'),
              patch.object(capacity, 'psql', return_value=b't')):
            tags.verify_migration(Path('candidate'), before)
        for name, after in refused.items():
            with (self.subTest(name),
                  patch.object(tags, 'snapshot', return_value=after),
                  patch.object(base, 'attachment_versions', return_value=accepted['versions']),
                  patch.object(base, 'verify_community_tables'),
                  patch.object(capacity, 'psql', return_value=b't'),
                  self.assertRaises(RuntimeError)):
                tags.verify_migration(Path('candidate'), before)
        with (patch.object(tags, 'snapshot', return_value=accepted),
              patch.object(base, 'attachment_versions', return_value=accepted['versions']),
              patch.object(base, 'verify_community_tables'),
              patch.object(capacity, 'psql', return_value=b'f'),
              self.assertRaisesRegex(RuntimeError, 'reconciliation')):
            tags.verify_migration(Path('candidate'), before)

    def test_snapshot_compares_every_preserved_table_and_adds_tag_metrics(self):
        batches = tags.previous.directory.ranking.batches
        with (patch.object(tags.backups, 'database_snapshot', return_value={'tables': {}}) as small,
              patch.object(batches, 'snapshot', return_value={'message_changes': 'digest'}),
              patch.object(tags, 'metrics', return_value={'missing': 0})):
            result = tags.snapshot()
        self.assertIn('community_tags', small.call_args.args[0])
        self.assertNotIn('message_changes', small.call_args.args[0])
        self.assertEqual(small.call_args.kwargs, {'version_limit': 100, 'include_reserved': True})
        self.assertEqual(result['default_tags'], {'missing': 0})

    def test_explicit_flag_reuses_verified_backup_and_worker_recovery(self):
        for config in [{}, {'default_tags': False}, {'default_tags': 1}, {'share_counts': True}]:
            with (patch.object(base, 'activate_database') as activate,
                  self.assertRaisesRegex(RuntimeError, 'explicit --default-tags approval')):
                tags.activate(config, Path('work'), Path('candidate'), {})
            activate.assert_not_called()
        with (patch.object(tags.background, 'verify_current'),
              patch.object(tags.previous.directory.ranking.parts, 'require_workers'),
              patch.object(base, 'receipt'),
              patch.object(base, 'activate_database', return_value={'status': 'published'}) as activate):
            result = tags.activate({'default_tags': True}, Path('work'), Path('candidate'), {})
        contract = activate.call_args.args[3]
        self.assertEqual(contract['versions'], 99)
        self.assertIs(contract['snapshot'], tags.snapshot)
        self.assertIs(contract['verify'], tags.verify_migration)
        self.assertIs(contract['stop_existing'], tags.background.stop)
        self.assertIs(contract['resume_existing'], tags.background.start)
        self.assertEqual(result['default_tags_schema_versions'], 100)

    def test_cli_refuses_other_operational_transitions(self):
        for other in ['--prepare', '--share-counts', '--group-fences', '--community-games', '--message-sync',
                      '--post-search', '--contact-invitations', '--profile-directory', '--capacity',
                      '--request-limit', '--media-worker', '--worker-boot']:
            args = ['deploy.py', '--default-tags', other]
            if other != '--prepare': args.append('--check')
            with (patch.object(sys, 'argv', args), patch.object(deploy, 'shared_private_workspace'),
                  patch.object(deploy, 'repository') as repository,
                  contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit)):
                deploy.main()
            repository.assert_not_called()

    def test_check_transports_approval_without_activating(self):
        with (patch.object(sys, 'argv', ['deploy.py', '--check', '--default-tags']),
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
        self.assertIs(remote.call_args.args[1]['default_tags'], True)
