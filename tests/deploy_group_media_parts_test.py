"""Group-part activation guards; synthetic files and mocked host only."""
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'infra/staging'))
import deploy_group_media_parts as parts
import deploy_remote as base
import deploy_blocks45 as backups


class GroupMediaPartsDeploymentTests(unittest.TestCase):
    def test_exact_dispatch_does_not_reuse_the_old_proxy_transition(self):
        with tempfile.TemporaryDirectory() as directory:
            candidate = Path(directory)
            migrations = candidate / 'src/server/database/migrations'
            migrations.mkdir(parents=True)
            for number in range(1, 92):
                (migrations / ('%03d.sql' % number)).write_text('-- synthetic')
            with patch.object(parts, 'review') as reviewed:
                base.database_review(candidate, Path('live'))
                reviewed.assert_called_once_with(candidate, Path('live'))

    def test_review_requires_exact_sources_units_constraint_and_volume(self):
        with (patch.object(base, 'reviewed_database') as source,
              patch.object(base, 'verify_community_tables'),
              patch.object(base, 'digest', return_value='same'),
              patch.object(parts.capacity, 'psql', return_value=parts.BEFORE_CHECK),
              patch.object(parts.capacity, 'volume_review') as volume):
            parts.review(Path('candidate'), Path('live'))
            self.assertEqual(source.call_args.args[2], {'before': parts.BEFORE,
                'reviewed': parts.REVIEWED, 'versions': 91, 'previous_versions': 90})
            volume.assert_called_once()
        for units, constraint in [(['new', 'old'], parts.BEFORE_CHECK),
                                  (['same'] * 8, parts.AFTER_CHECK)]:
            with (patch.object(base, 'reviewed_database'),
                  patch.object(base, 'verify_community_tables'),
                  patch.object(base, 'digest', side_effect=units),
                  patch.object(parts.capacity, 'psql', return_value=constraint),
                  self.assertRaises(RuntimeError)):
                parts.review(Path('candidate'), Path('live'))
        with (patch.object(parts, 'REVIEWED', 'unreviewed'),
              patch.object(base, 'reviewed_database') as source,
              self.assertRaises(RuntimeError)):
            parts.review(Path('candidate'), Path('live'))
        source.assert_not_called()

    def test_not_loaded_or_missing_leases_refuses_before_any_maintenance(self):
        for loaded, ready in [(b'not-found', True), (b'loaded', False)]:
            with (patch.object(parts.background, 'verify_current'),
                  patch.object(base, 'run', return_value=loaded),
                  patch.object(parts.background, 'ready', return_value=ready),
                  patch.object(base, 'activate_database') as activate,
                  self.assertRaisesRegex(RuntimeError, 'refusing maintenance')):
                parts.activate({}, Path('work'), Path('candidate'), {})
            activate.assert_not_called()

    def test_success_reuses_existing_backup_and_phase_aware_recovery(self):
        with (patch.object(parts.background, 'verify_current'),
              patch.object(base, 'run', return_value=b'loaded'),
              patch.object(parts.background, 'ready', return_value=True),
              patch.object(base, 'receipt'),
              patch.object(base, 'activate_database', return_value={'status': 'published'}) as activate):
            result = parts.activate({}, Path('work'), Path('candidate'), {})
        contract = activate.call_args.args[3]
        self.assertEqual(contract['versions'], 90)
        self.assertIs(contract['snapshot'], parts.snapshot)
        self.assertIs(contract['stop_existing'], parts.background.stop)
        self.assertIs(contract['resume_existing'], parts.background.start)
        self.assertIs(contract['start'], parts.background.start)
        self.assertNotIn('install', contract)
        self.assertEqual(result['group_media_parts_schema_versions'], 91)

    def test_snapshot_includes_reserved_bytes_instead_of_historical_projection(self):
        with patch.object(backups, 'database_snapshot') as snapshot:
            parts.snapshot()
        snapshot.assert_called_once_with(parts.TABLES + ('content_usage',),
            version_limit=91, include_reserved=True)
        for include_reserved, excluded in [(False, '["reserved_bytes"]'), (True, '[]')]:
            with patch.object(backups, 'node', return_value=b'{"tables":{},"versions":[]}') as node:
                backups.database_snapshot(('group_media',), include_reserved=include_reserved)
            self.assertIn('[[...' + excluded + ',...(omitted[name]??[])]]', node.call_args.args[0])

    def test_verification_preserves_all_rows_history_and_allows_existing_credits(self):
        versions = list(range(91))
        before = {'versions': versions[:90], 'tables': {'group_media': 'twelve-parts',
            'content_allocations': 'existing-credits', 'storage_reservation_usage': 'reserved'}}
        after = dict(before, versions=versions)
        for changed in [dict(after, versions=[]), dict(after, tables={})]:
            with (patch.object(parts, 'snapshot', return_value=changed),
                  patch.object(base, 'attachment_versions', return_value=versions),
                  self.assertRaisesRegex(RuntimeError, 'rows, charges or applied history')):
                parts.verify_migration(Path('candidate'), before)
        for responses in [[parts.BEFORE_CHECK], [parts.AFTER_CHECK, b'f'],
                          [parts.AFTER_CHECK, b't', b'f']]:
            with (patch.object(parts, 'snapshot', return_value=after),
                  patch.object(base, 'attachment_versions', return_value=versions),
                  patch.object(base, 'verify_community_tables'),
                  patch.object(parts.capacity, 'psql', side_effect=responses),
                  self.assertRaises(RuntimeError)):
                parts.verify_migration(Path('candidate'), before)
        with (patch.object(parts, 'snapshot', return_value=after),
              patch.object(base, 'attachment_versions', return_value=versions),
              patch.object(base, 'verify_community_tables'),
              patch.object(parts.capacity, 'psql', side_effect=[parts.AFTER_CHECK, b't', b't'])):
            parts.verify_migration(Path('candidate'), before)
        self.assertNotIn('NOT EXISTS(SELECT 1 FROM hash_talk.content_allocations)', parts.COUNTER_CHECKS)
