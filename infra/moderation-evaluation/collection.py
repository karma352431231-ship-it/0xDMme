"""Temporary originals and owner labels, kept apart from all inference."""
import hashlib
import time
import uuid


class CollectionError(Exception):
    def __init__(self, status, code):
        self.status, self.code = status, code
        super().__init__(code)


class ImageCollection:
    def __init__(self, *, clock=time.time, lifetime=86400, max_cases=256, max_bytes=512 * 1024**2):
        self.clock, self.expires_at = clock, clock() + lifetime
        self.max_cases, self.max_bytes = max_cases, max_bytes
        self.entries, self.hashes, self.used_bytes = {}, {}, 0
        self.round_id, self.completed_at = str(uuid.uuid4()), None

    def active(self):
        if self.clock() >= self.expires_at:
            self.entries.clear()
            self.hashes.clear()
            self.used_bytes = 0
            raise CollectionError(410, 'round_expired')

    def writable(self):
        self.active()
        if self.completed_at is not None:
            raise CollectionError(409, 'round_completed')

    @staticmethod
    def metadata(entry):
        return {key: value for key, value in entry.items() if key != 'image'}

    @staticmethod
    def reference(value):
        if value not in ('allow', 'reject'):
            raise CollectionError(400, 'invalid_reference')
        return value

    def add(self, image, mime, reference):
        self.writable()
        self.reference(reference)
        digest = hashlib.sha256(image).hexdigest()
        if digest in self.hashes:
            previous = self.entries[self.hashes[digest]]
            if previous['reference'] != reference:
                raise CollectionError(409, 'conflicting_reference')
            return self.metadata(previous)
        if len(self.entries) >= self.max_cases or self.used_bytes + len(image) > self.max_bytes:
            raise CollectionError(507, 'round_full')
        entry = {'id': str(uuid.uuid4()), 'ordinal': len(self.entries) + 1,
                 'imageHash': digest, 'bytes': len(image), 'mime': mime,
                 'reference': reference, 'createdAt': int(self.clock() * 1000), 'image': image}
        self.entries[entry['id']], self.hashes[digest] = entry, entry['id']
        self.used_bytes += len(image)
        return self.metadata(entry)

    def snapshot(self):
        self.active()
        return {'schema': '0xdmme-image-collection-v1', 'roundId': self.round_id,
                'expiresAt': int(self.expires_at * 1000), 'completedAt': self.completed_at,
                'usedBytes': self.used_bytes, 'maxBytes': self.max_bytes, 'maxCases': self.max_cases,
                'cases': [self.metadata(entry) for entry in self.entries.values()]}

    def image(self, identity):
        self.active()
        entry = self.entries[identity]
        return entry['image'], entry['mime']

    def annotate(self, identity, reference):
        self.writable()
        entry = self.entries[identity]
        entry['reference'] = self.reference(reference)
        return self.metadata(entry)

    def complete(self):
        self.active()
        if not self.entries:
            raise CollectionError(409, 'round_empty')
        if self.completed_at is None:
            self.completed_at = int(self.clock() * 1000)
        return self.snapshot()
