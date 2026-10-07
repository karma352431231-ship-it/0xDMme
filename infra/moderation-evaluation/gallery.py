"""Bounded, process-local calibration round; no disk writes, training or app access."""
import hashlib
import io
import json
import math
import time
import uuid
import zipfile

REFERENCES = ('safe', 'unsafe', 'uncertain')
LABELS = ('safe', 'hentai', 'porn', 'sexy', 'drawing')
MAX_PREVIEW_BYTES = 512 * 1024
EXTENSIONS = {'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp'}


class GalleryFull(Exception):
    pass


class GalleryExpired(Exception):
    pass


class CalibrationGallery:
    def __init__(self, *, max_bytes=512 * 1024**2, max_cases=256, lifetime=86400, clock=time.time):
        self.max_bytes, self.max_cases, self.clock = max_bytes, max_cases, clock
        self.expires_at = clock() + lifetime
        self.entries, self.used_bytes, self.round_id = {}, 0, str(uuid.uuid4())

    def erase(self):
        self.entries.clear()
        self.used_bytes = 0
        self.round_id = str(uuid.uuid4())

    def active(self):
        if self.clock() >= self.expires_at:
            self.erase()
            raise GalleryExpired()

    def capacity(self, size):
        self.active()
        if len(self.entries) >= self.max_cases or self.used_bytes + size > self.max_bytes:
            raise GalleryFull()

    @staticmethod
    def public(entry):
        # Copy nested scores so reference edits cannot accidentally alter inference results.
        result = {key: value for key, value in entry.items() if key not in ('image', 'preview')}
        result['scores'] = dict(entry['scores'])
        return result

    def add(self, image, mime, preview, reference, result):
        if reference not in REFERENCES or mime not in EXTENSIONS or not 0 < len(preview) <= MAX_PREVIEW_BYTES:
            raise RuntimeError('Invalid calibration record.')
        scores = result['scores']
        if (set(scores) != set(LABELS) or any(type(value) not in (float, int) or not math.isfinite(value)
                or not 0 <= value <= 1 for value in scores.values())
                or abs(sum(scores.values()) - 1) > 0.00001):
            raise RuntimeError('Invalid experimental scores.')
        self.capacity(len(image) + len(preview))
        entry = {**result, 'scores': dict(scores), 'id': str(uuid.uuid4()),
                 'imageHash': hashlib.sha256(image).hexdigest(), 'previewHash': hashlib.sha256(preview).hexdigest(),
                 'mime': mime, 'bytes': len(image), 'previewBytes': len(preview),
                 'createdAt': int(self.clock() * 1000), 'reference': reference, 'image': image, 'preview': preview}
        self.entries[entry['id']] = entry
        self.used_bytes += len(image) + len(preview)
        return self.public(entry)

    def snapshot(self):
        self.active()
        return {'roundId': self.round_id, 'expiresAt': int(self.expires_at * 1000),
                'usedBytes': self.used_bytes, 'maxBytes': self.max_bytes, 'maxCases': self.max_cases,
                'cases': [self.public(entry) for entry in reversed(list(self.entries.values()))]}

    def find(self, identity):
        self.active()
        return self.entries[identity]

    def image(self, identity, kind):
        entry = self.find(identity)
        return entry[kind], entry['mime'] if kind == 'image' else 'image/png'

    def annotate(self, identity, reference):
        if reference not in REFERENCES:
            raise ValueError('Invalid reference.')
        entry = self.find(identity)
        entry['reference'] = reference
        return self.public(entry)

    def archive(self):
        snapshot = self.snapshot()
        manifest = {'schema': '0xdmme-calibration-v1', **snapshot}
        # Already-compressed original bytes are preserved exactly, without lossy recompression.
        with io.BytesIO() as output:
            with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_STORED) as archive:
                for entry in manifest['cases']:
                    entry['imagePath'] = 'images/' + entry['id'] + '.' + EXTENSIONS[entry['mime']]
                    archive.writestr(entry['imagePath'], self.entries[entry['id']]['image'])
                archive.writestr('results.json', json.dumps(manifest, allow_nan=False, indent=2).encode())
            return output.getvalue()
