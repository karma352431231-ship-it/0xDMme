"""Collection contracts: original bytes, references, auth, completion, and expiry."""
import hashlib
import http.client
import json
import sys
import threading
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'infra/moderation-evaluation'))
from collection import CollectionError, ImageCollection
from collection_server import CollectionServer

IMAGE = b'\x89PNG\r\n\x1a\nsynthetic-envelope-for-collection-tests'


class CollectionRulesTest(unittest.TestCase):
    def setUp(self):
        self.now = 1000
        self.collection = ImageCollection(clock=lambda: self.now)

    def test_original_binding_deduplication_and_explicit_correction(self):
        first = self.collection.add(IMAGE, 'image/png', 'allow')
        self.assertEqual(first['imageHash'], hashlib.sha256(IMAGE).hexdigest())
        self.assertEqual(self.collection.image(first['id']), (IMAGE, 'image/png'))
        self.assertEqual(self.collection.add(IMAGE, 'image/png', 'allow'), first)
        with self.assertRaises(CollectionError) as caught:
            self.collection.add(IMAGE, 'image/png', 'reject')
        self.assertEqual(caught.exception.code, 'conflicting_reference')
        corrected = self.collection.annotate(first['id'], 'reject')
        self.assertEqual(corrected['imageHash'], first['imageHash'])
        self.assertEqual(corrected['reference'], 'reject')
        self.assertEqual(len(self.collection.snapshot()['cases']), 1)
        self.assertNotIn('image', corrected)
        self.assertNotIn('scores', corrected)

    def test_completion_is_idempotent_and_freezes_references_and_originals(self):
        case = self.collection.add(IMAGE, 'image/png', 'allow')
        completed = self.collection.complete()
        self.now += 1
        self.assertEqual(self.collection.complete()['completedAt'], completed['completedAt'])
        for mutation in [lambda: self.collection.add(b'other', 'image/png', 'allow'),
                         lambda: self.collection.annotate(case['id'], 'reject')]:
            with self.assertRaises(CollectionError) as caught:
                mutation()
            self.assertEqual(caught.exception.code, 'round_completed')
        self.assertEqual(self.collection.image(case['id'])[0], IMAGE)

    def test_empty_collection_cannot_complete_and_invalid_reference_cannot_change_case(self):
        with self.assertRaises(CollectionError):
            self.collection.complete()
        case = self.collection.add(IMAGE, 'image/png', 'allow')
        with self.assertRaises(CollectionError):
            self.collection.annotate(case['id'], 'uncertain')
        self.assertEqual(self.collection.snapshot()['cases'], [case])

    def test_expiry_erases_originals_even_after_completion(self):
        self.collection.add(IMAGE, 'image/png', 'allow')
        self.collection.complete()
        self.now += 86400
        with self.assertRaises(CollectionError) as caught:
            self.collection.snapshot()
        self.assertEqual(caught.exception.status, 410)
        self.assertEqual(self.collection.entries, {})
        self.assertEqual(self.collection.hashes, {})

    def test_capacity_failure_keeps_existing_originals_and_reference(self):
        first = self.collection.add(IMAGE, 'image/png', 'allow')
        self.collection.max_bytes = len(IMAGE)
        with self.assertRaises(CollectionError) as caught:
            self.collection.add(b'another', 'image/png', 'reject')
        self.assertEqual(caught.exception.status, 507)
        self.assertEqual(self.collection.snapshot()['cases'], [first])
        self.assertEqual(self.collection.image(first['id'])[0], IMAGE)


class CollectionHttpTest(unittest.TestCase):
    def setUp(self):
        self.token = 'a' * 64
        self.server = CollectionServer(('127.0.0.1', 0), assets={}, token=self.token)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.thread.join(2)
        self.server.server_close()

    def request(self, method, path, body=None, headers=None):
        merged = {'Authorization': 'Bearer ' + self.token, 'Origin': self.server.origin}
        merged.update(headers or {})
        connection = http.client.HTTPConnection('127.0.0.1', self.server.server_port, timeout=2)
        connection.request(method, path, body=body, headers=merged)
        response = connection.getresponse()
        result = (response.status, dict(response.getheaders()), response.read())
        connection.close()
        return result

    def save(self):
        code, _, body = self.request('POST', '/api/cases', IMAGE,
                                    {'Content-Type': 'image/png', 'X-Collection-Reference': 'allow'})
        self.assertEqual(code, 200)
        return json.loads(body)

    def test_original_recovery_and_completion_flow(self):
        case = self.save()
        code, headers, body = self.request('GET', '/api/cases/' + case['id'] + '/image')
        self.assertEqual((code, body), (200, IMAGE))
        self.assertEqual(headers['Cache-Control'], 'no-store')
        self.assertEqual(headers['X-Content-Type-Options'], 'nosniff')
        self.assertEqual(self.request('POST', '/api/complete')[0], 200)
        code, _, body = self.request('GET', '/api/cases')
        self.assertEqual(code, 200)
        self.assertIsNotNone(json.loads(body)['completedAt'])
        self.assertEqual(self.request('POST', '/api/cases', IMAGE,
                                     {'Content-Type': 'image/png', 'X-Collection-Reference': 'allow'})[0], 409)

    def test_all_private_routes_require_capability_and_same_origin(self):
        case = self.save()
        for method, path in [('GET', '/api/cases'), ('GET', '/api/cases/' + case['id'] + '/image'),
                             ('POST', '/api/complete'), ('POST', '/api/cases'),
                             ('POST', '/api/cases/' + case['id'] + '/reference')]:
            self.assertEqual(self.request(method, path, headers={'Authorization': ''})[0], 401)
            self.assertEqual(self.request(method, path, headers={'Origin': 'https://untrusted.invalid'})[0], 404)
        self.assertIsNone(self.server.collection.completed_at)
        self.assertEqual(len(self.server.collection.entries), 1)

    def test_wrong_envelope_missing_label_and_transfer_encoding_never_create_case(self):
        requests = [(b'<svg/>', {'Content-Type': 'image/png', 'X-Collection-Reference': 'allow'}),
                    (IMAGE, {'Content-Type': 'image/png'}),
                    (IMAGE, {'Content-Type': 'image/png', 'X-Collection-Reference': 'allow',
                             'Transfer-Encoding': 'chunked'})]
        for body, headers in requests:
            self.assertEqual(self.request('POST', '/api/cases', body, headers)[0], 400)
        self.assertEqual(self.server.collection.entries, {})

    def test_reference_mutation_rejects_extra_fields_and_is_closed_after_completion(self):
        case = self.save()
        path = '/api/cases/' + case['id'] + '/reference'
        headers = {'Content-Type': 'application/json'}
        self.assertEqual(self.request('POST', path, b'{"reference":"reject","scores":{}}', headers)[0], 400)
        self.assertEqual(self.request('POST', path, b'{"reference":"reject"}', headers)[0], 200)
        self.assertEqual(self.request('POST', '/api/complete')[0], 200)
        self.assertEqual(self.request('POST', path, b'{"reference":"allow"}', headers)[0], 409)
        self.assertEqual(self.server.collection.snapshot()['cases'][0]['reference'], 'reject')


if __name__ == '__main__':
    unittest.main()
