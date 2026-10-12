import base64
import json
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1] / 'infra/public-moderation'
sys.path.insert(0, str(ROOT))
import pose_worker as worker
from pose_runtime import PoseDetector


def shape(width=1, height=1):
    factor = min(512 / width, 512 / height)
    w, h = max(1, round(width * factor)), max(1, round(height * factor))
    return {'native': {'width': width, 'height': height},
            'context': {'width': w, 'height': h, 'left': (512 - w) // 2, 'top': (512 - h) // 2}}


def request():
    return {'id': 1, 'shape': shape(), 'frames': [{
        'native': base64.b64encode(bytes((3, 4, 5, 255))).decode(),
        'context': base64.b64encode(bytes((3, 4, 5, 255)) * (512 * 512)).decode(),
    }]}


class PoseProtocolTests(unittest.TestCase):
    def test_complete_paired_frames_and_monotonic_request_identity(self):
        frames, geometry = worker.request(json.dumps(request()), 1)
        self.assertEqual(geometry, shape())
        self.assertEqual(len(frames), 1)
        self.assertEqual(frames[0][0], bytes((3, 4, 5, 255)))
        for value in (True, 1.0, 0, 2):
            data = request() | {'id': value}
            with self.subTest(value=value), self.assertRaises(ValueError):
                worker.request(json.dumps(data), 1)

    def test_truncated_malformed_or_unpaired_inputs_never_reach_inference(self):
        for change in ({'native': 'AAAA'}, {'context': 'AAAA'}, {'context': '?' * 1_398_104}):
            data = request()
            data['frames'][0].update(change)
            with self.subTest(change=list(change)), self.assertRaises(ValueError):
                worker.request(json.dumps(data), 1)
        for frames in ([], [request()['frames'][0]] * 3, [{'native': 'AAAAAA=='}]):
            with self.subTest(frames=len(frames)), self.assertRaises(ValueError):
                worker.request(json.dumps(request() | {'frames': frames}), 1)

    def test_native_budget_and_whole_canonical_geometry(self):
        self.assertEqual(worker.dimensions(shape(1024, 5)), shape(1024, 5))
        for geometry in (shape(2049, 1), shape() | {'native': {'width': True, 'height': 1}},
                         shape() | {'context': {'width': 1, 'height': 1, 'left': 0, 'top': 0}}):
            with self.subTest(geometry=geometry), self.assertRaises(ValueError):
                worker.dimensions(geometry)

    def test_native_neutral_proof_cannot_use_the_reduced_context_instead(self):
        detector = PoseDetector.__new__(PoseDetector)
        uniform = bytes((3, 4, 5, 255)) * (1024 * 1024)
        context = bytes((3, 4, 5, 255)) * (512 * 512)
        self.assertEqual(detector.classify_prepared([(uniform, context)], shape(1024, 1024)), ['allow'])
        changed = bytearray(uniform)
        changed[4 * 777] = 255
        # No model was loaded: one native differing pixel must require inference,
        # even when the reduced frame is perfectly uniform.
        with self.assertRaises(AttributeError):
            detector.classify_prepared([(bytes(changed), context)], shape(1024, 1024))
        with self.assertRaises(ValueError):
            detector.classify_prepared([(uniform[:-1], context)], shape(1024, 1024))

    def test_fully_transparent_native_frames_ignore_only_invisible_structure(self):
        detector = PoseDetector.__new__(PoseDetector)
        native = bytes((1, 2, 3, 0, 4, 5, 6, 0))
        context = bytes(512 * 512 * 4)
        self.assertEqual(detector.classify_prepared([(native, context)], shape(2, 1)), ['allow'])
        visible = native[:-1] + bytes((1,))
        with self.assertRaises(AttributeError):
            detector.classify_prepared([(visible, context)], shape(2, 1))

    def test_inference_audit_denies_connections(self):
        for event in ('socket.connect', 'socket.getaddrinfo'):
            with self.assertRaises(RuntimeError):
                worker.offline(event, ())


if __name__ == '__main__':
    unittest.main()
