"""Target isolation and explicit preservation categories, without SSH."""

import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'infra/staging'))
import deploy_target as target


class DeploymentTargetTests(unittest.TestCase):
    def test_explicit_profile_does_not_replace_default_target(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            local = root / '.local'; local.mkdir(mode=0o700)
            profiles = local / 'deployment-profiles'; profiles.mkdir(mode=0o700)
            destination = profiles / 'destination'; destination.mkdir(mode=0o700)
            for directory, value in [(local, 'root@source.invalid'), (destination, 'root@destination.invalid')]:
                path = directory / 'VPS_SSH_TARGET'; path.write_text(value); path.chmod(0o600)
            self.assertEqual(target.target(target.profile_directory(root)), 'root@source.invalid')
            self.assertEqual(target.target(target.profile_directory(root, 'destination')), 'root@destination.invalid')
            for name in ['../source', '/tmp', '', 'Destination']:
                with self.subTest(name=name), self.assertRaises(RuntimeError):
                    target.profile_directory(root, name)
            (profiles / 'alias').symlink_to(destination, target_is_directory=True)
            with self.assertRaises(RuntimeError): target.profile_directory(root, 'alias')
            (destination / 'VPS_SSH_TARGET').chmod(0o644)
            with self.assertRaises(RuntimeError): target.target(destination)

    def test_empty_site_category_requires_explicit_target_and_declaration(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            path = directory / 'VPS_DEPLOY_BASELINE.json'
            baseline = {'files': {'/etc/fixture': 'a' * 64}, 'services': {'fixture.service': 'running'}, 'sites': []}
            for value, explicit in [(baseline, True), (dict(baseline, empty_categories=['sites']), False),
                                    (dict(baseline, empty_categories=['sites', 'services']), True)]:
                path.write_text(json.dumps(value)); path.chmod(0o600)
                with self.assertRaises(RuntimeError): target.preservation_baseline(directory, explicit)
            baseline['empty_categories'] = ['sites']
            path.write_text(json.dumps(baseline))
            self.assertEqual(target.preservation_baseline(directory, True), baseline)
            path.unlink(); (directory / 'actual.json').write_text(json.dumps(baseline))
            path.symlink_to(directory / 'actual.json')
            with self.assertRaises(RuntimeError): target.preservation_baseline(directory, True)
