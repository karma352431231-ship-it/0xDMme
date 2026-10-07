"""Observable access/body/failure contracts for the isolated experimental HTTP tool."""
import http.client
import importlib.util
import json
import threading
import unittest
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
        self.server = module.EvaluationServer(('127.0.0.1', 0), assets={'index.html': b'own-page', 'client.js': b'own-code', 'style.css': b'own-style', 'source.tar.gz': b'own-source'}, origin=self.origin, token='a' * 64, detector=classify)
        self.thread = threading.Thread(target=lambda: self.server.serve_forever(poll_interval=0.01))
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=1)

    def request(self, method='POST', path='/api/evaluate', body=b'own-synthetic-bytes', headers=None):
        connection = http.client.HTTPConnection('127.0.0.1', self.server.server_port, timeout=2)
        values = {'Host': '127.0.0.1:45139', 'Origin': self.origin, 'Authorization': 'Bearer ' + 'a' * 64, 'Content-Type': 'image/png'}
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


if __name__ == '__main__':
    unittest.main()
