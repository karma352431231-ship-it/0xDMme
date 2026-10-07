"""Observable access/body/failure contracts for the isolated experimental HTTP tool."""
import http.client
import hashlib
import io
import importlib.util
import json
import threading
import unittest
import zipfile
from pathlib import Path

spec = importlib.util.spec_from_file_location('experimental_server', Path(__file__).resolve().parents[1] / 'infra/moderation-evaluation/server.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ExperimentalEvaluationTest(unittest.TestCase):
    def setUp(self):
        self.calls = []
        self.failure = False
        self.origin = 'http://127.0.0.1:45139'
        def classify(payload, mime):
            self.calls.append((payload, mime))
            if self.failure:
                raise RuntimeError('Synthetic unavailable detector.')
            return {'safe': 0.1, 'hentai': 0.1, 'porn': 0.1, 'sexy': 0.1, 'drawing': 0.6}
        self.server = module.EvaluationServer(('127.0.0.1', 0), assets={'index.html': b'own-page', 'client.js': b'own-code', 'style.css': b'own-style', 'source.tar.gz': b'own-source'}, origin=self.origin, token='a' * 64, detector=classify, preview=lambda payload: b'own-thumbnail-' + payload)
        self.thread = threading.Thread(target=lambda: self.server.serve_forever(poll_interval=0.01))
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=1)

    def request(self, method='POST', path='/api/evaluate', body=b'own-synthetic-bytes', headers=None):
        connection = http.client.HTTPConnection('127.0.0.1', self.server.server_port, timeout=2)
        values = {'Host': '127.0.0.1:45139', 'Origin': self.origin, 'Authorization': 'Bearer ' + 'a' * 64, 'Content-Type': 'image/png', 'X-Evaluation-Reference': 'uncertain'}
        values.update(headers or {})
        try:
            connection.request(method, path, body=body, headers=values)
            response = connection.getresponse()
            return response.status, dict(response.getheaders()), response.read()
        finally:
            connection.close()

    def test_capability_and_local_origin_before_reading_image(self):
        for headers, expected in [({'Authorization': 'Bearer ' + 'b' * 64}, 401), ({'Origin': 'https://unrelated.invalid'}, 404), ({'Host': 'unrelated.invalid'}, 404), ({'Sec-Fetch-Site': 'cross-site'}, 404)]:
            self.assertEqual(self.request(headers=headers)[0], expected)
        self.assertEqual(self.calls, [])

    def test_known_assets_and_no_store_security_headers(self):
        status, headers, body = self.request(method='GET', path='/', body=None)
        self.assertEqual((status, body), (200, b'own-page'))
        self.assertEqual(headers['Cache-Control'], 'no-store')
        self.assertIn("frame-ancestors 'none'", headers['Content-Security-Policy'])
        self.assertEqual(self.request(method='GET', path='/source.tar.gz', body=None)[::2], (200, b'own-source'))
        self.assertEqual(self.request(method='GET', path='/anything', body=None)[0], 404)

    def test_image_envelope_budget_type_and_transfer_encoding(self):
        for headers in [{'Content-Type': 'image/gif'}, {'Content-Length': str(module.MAX_BYTES + 1)}, {'Transfer-Encoding': 'chunked'}, {'Content-Length': '0'}]:
            self.assertEqual(self.request(headers=headers)[0], 400)
        self.assertEqual(self.calls, [])

    def test_model_result_and_failure_never_simulates_policy_approval(self):
        status, _headers, body = self.request()
        self.assertEqual(status, 200)
        result = json.loads(body)
        self.assertEqual(result['modelHash'], module.MODEL_HASH)
        self.assertNotIn('verdict', result)
        self.assertEqual(self.calls, [(b'own-synthetic-bytes', 'image/png')])
        self.failure = True
        self.assertEqual(self.request()[0], 503)
        self.assertEqual(len(self.server.gallery.snapshot()['cases']), 1)

    def test_images_results_references_remain_bound_and_export_is_lossless(self):
        first = json.loads(self.request(body=b'first-original', headers={'X-Evaluation-Reference': 'safe'})[2])
        second = json.loads(self.request(body=b'second-original', headers={'X-Evaluation-Reference': 'unsafe'})[2])
        self.assertNotEqual(first['id'], second['id'])
        self.assertEqual(first['imageHash'], hashlib.sha256(b'first-original').hexdigest())
        self.assertEqual(self.calls, [(b'first-original', 'image/png'), (b'second-original', 'image/png')])
        snapshot = json.loads(self.request(method='GET', path='/api/cases', body=None)[2])
        self.assertEqual(snapshot['cases'], [second, first])
        self.assertNotIn('image', first)
        path = '/api/cases/' + first['id']
        self.assertEqual(self.request(method='GET', path=path + '/image', body=None)[::2], (200, b'first-original'))
        self.assertEqual(self.request(method='GET', path=path + '/preview', body=None)[2], b'own-thumbnail-first-original')
        changed = json.loads(self.request(path=path + '/reference', body=b'{"reference":"unsafe"}', headers={'Content-Type': 'application/json'})[2])
        self.assertEqual(changed['reference'], 'unsafe')
        self.assertEqual(changed['scores'], first['scores'])
        self.assertEqual(changed['imageHash'], first['imageHash'])
        self.assertEqual(len(self.calls), 2)
        status, headers, payload = self.request(method='GET', path='/api/export', body=None)
        self.assertEqual(status, 200)
        self.assertEqual(headers['Content-Type'], 'application/zip')
        with zipfile.ZipFile(io.BytesIO(payload)) as archive:
            manifest = json.loads(archive.read('results.json'))
            for entry in manifest['cases']:
                original = archive.read(entry['imagePath'])
                self.assertEqual(hashlib.sha256(original).hexdigest(), entry['imageHash'])
                self.assertEqual(len(original), entry['bytes'])
            self.assertEqual(len(archive.namelist()), 3)

    def test_every_private_gallery_route_requires_capability_and_local_origin(self):
        case = json.loads(self.request()[2])
        prefix = '/api/cases/' + case['id']
        for method, path in [('GET', '/api/cases'), ('GET', '/api/export'), ('GET', prefix + '/image'),
                             ('GET', prefix + '/preview'), ('POST', prefix + '/reference'), ('DELETE', '/api/cases')]:
            self.assertEqual(self.request(method=method, path=path, headers={'Authorization': ''})[0], 401)
            self.assertEqual(self.request(method=method, path=path, headers={'Origin': 'https://unrelated.invalid'})[0], 404)
        self.assertEqual(len(self.server.gallery.snapshot()['cases']), 1)
        self.assertEqual(self.request(method='GET', path=prefix + '/image?secret=ignored')[0], 404)

    def test_full_gallery_preserves_existing_cases_and_fails_before_inference(self):
        self.server.gallery.max_cases = 1
        first = json.loads(self.request()[2])
        self.assertEqual(self.request(body=b'new-original')[0], 507)
        self.assertEqual(len(self.calls), 1)
        self.assertEqual(self.server.gallery.snapshot()['cases'], [first])
        self.server.gallery.max_cases = 256
        self.server.gallery.max_bytes = self.server.gallery.used_bytes + 1
        self.assertEqual(self.request()[0], 507)
        self.assertEqual(self.server.gallery.snapshot()['cases'], [first])

    def test_expiration_and_explicit_clear_close_image_access_without_extending_deadline(self):
        now = [1000]
        self.server.gallery = module.CalibrationGallery(lifetime=10, clock=lambda: now[0])
        first = json.loads(self.request()[2])
        expires = self.server.gallery.snapshot()['expiresAt']
        status, _headers, body = self.request(method='DELETE', path='/api/cases', body=None)
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body)['cases'], [])
        self.assertEqual(json.loads(body)['expiresAt'], expires)
        self.assertEqual(self.request(method='GET', path='/api/cases/' + first['id'] + '/image')[0], 404)
        second = json.loads(self.request()[2])
        now[0] = 1010
        for path in ['/api/cases', '/api/export', '/api/cases/' + second['id'] + '/image']:
            self.assertEqual(self.request(method='GET', path=path)[0], 410)
        self.assertEqual(self.server.gallery.entries, {})
        self.assertEqual(self.request()[0], 410)

    def test_unconfirmed_reference_or_invalid_annotation_never_creates_or_changes_case(self):
        for value in ['', 'approved', 'safe,unsafe']:
            self.assertEqual(self.request(headers={'X-Evaluation-Reference': value})[0], 400)
        self.assertEqual(self.calls, [])
        case = json.loads(self.request()[2])
        for body in [b'[]', b'{"reference":"approved"}', b'{"reference":"safe","scores":{}}']:
            self.assertEqual(self.request(path='/api/cases/' + case['id'] + '/reference', body=body, headers={'Content-Type': 'application/json'})[0], 400)
        self.assertEqual(self.server.gallery.snapshot()['cases'], [case])


if __name__ == '__main__':
    unittest.main()
