"""Serial bounded subprocess protocol; never log pixels or model diagnostics."""
import base64
import json
import os
from pathlib import Path
import sys

MAX_LINE = 50_500_000
sys.path.insert(0, str(Path(__file__).resolve().parent))
from pose_artifacts import model_identity


def offline(event, _args):
    if event in ('socket.connect', 'socket.getaddrinfo'):
        raise RuntimeError('Network disabled for inference.')


def dimensions(shape):
    if not isinstance(shape, dict) or set(shape) != {'native', 'context'}:
        raise ValueError('Invalid prepared shape.')
    for key, names in (('native', {'width', 'height'}),
                       ('context', {'width', 'height', 'left', 'top'})):
        if not isinstance(shape[key], dict) or set(shape[key]) != names:
            raise ValueError('Invalid frame dimensions.')
        if any(type(value) is not int for value in shape[key].values()):
            raise ValueError('Integer frame dimensions required.')
    native, context = shape['native'], shape['context']
    if not all(1 <= native[key] <= 2048 for key in ('width', 'height')):
        raise ValueError('Prepared frame exceeds native budget.')
    if (not all(1 <= context[key] <= 512 for key in ('width', 'height'))
            or context['left'] < 0 or context['top'] < 0
            or context['left'] + context['width'] > 512
            or context['top'] + context['height'] > 512):
        raise ValueError('Invalid contextual frame crop.')
    factor = min(512 / native['width'], 512 / native['height'])
    width = max(1, round(native['width'] * factor))
    height = max(1, round(native['height'] * factor))
    expected = {'width': width, 'height': height,
                'left': (512 - width) // 2, 'top': (512 - height) // 2}
    if context != expected:
        raise ValueError('Whole canonical frame required.')
    return shape


def decode(value, size):
    if not isinstance(value, str) or len(value) != 4 * ((size + 2) // 3):
        raise ValueError('Invalid encoded frame size.')
    pixels = base64.b64decode(value, validate=True)
    if len(pixels) != size:
        raise ValueError('Incomplete frame.')
    return pixels


def request(line, expected):
    data = json.loads(line)
    if not isinstance(data, dict) or set(data) != {'id', 'shape', 'frames'}:
        raise ValueError('Invalid inference request.')
    if type(data['id']) is not int or data['id'] != expected:
        raise ValueError('Unexpected inference request.')
    shape = dimensions(data['shape'])
    frames = data['frames']
    if not isinstance(frames, list) or not 1 <= len(frames) <= 2:
        raise ValueError('Invalid inference batch.')
    decoded = []
    for frame in frames:
        if not isinstance(frame, dict) or set(frame) != {'native', 'context'}:
            raise ValueError('Complete paired frames required.')
        decoded.append((decode(frame['native'], shape['native']['width'] * shape['native']['height'] * 4),
                        decode(frame['context'], 512 * 512 * 4)))
    return decoded, shape


def main():
    if len(sys.argv) != 2:
        raise ValueError('One model directory required.')
    for key in ('HF_HUB_OFFLINE', 'TRANSFORMERS_OFFLINE', 'HF_HUB_DISABLE_TELEMETRY', 'DO_NOT_TRACK'):
        os.environ[key] = '1'
    for key in ('OPENBLAS_NUM_THREADS', 'OMP_NUM_THREADS', 'MKL_NUM_THREADS', 'VECLIB_MAXIMUM_THREADS'):
        os.environ[key] = '4'
    sys.addaudithook(offline)
    from pose_runtime import PoseDetector
    detector = PoseDetector(Path(sys.argv[1]))
    print(json.dumps({'ready': True, 'model': model_identity()}), flush=True)
    expected = 1
    while True:
        line = sys.stdin.buffer.readline(MAX_LINE + 1)
        if not line:
            return
        if len(line) > MAX_LINE or not line.endswith(b'\n'):
            raise ValueError('Inference request exceeds budget.')
        frames, shape = request(line, expected)
        verdicts = detector.classify_prepared(frames, shape)
        print(json.dumps({'id': expected, 'verdicts': verdicts}), flush=True)
        expected += 1


if __name__ == '__main__':
    try:
        main()
    except Exception:
        sys.stderr.write('Public inference unavailable.\n')
        sys.exit(1)
