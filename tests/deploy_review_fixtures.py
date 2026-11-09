"""Historical deployment inputs independent of the current dependency tree."""

import gzip
from pathlib import Path


def reviewed_runtime_lock():
    """Return the exact push lock from 20d8fe09, checked by existing digest guards.

    The compressed fixture preserves the original bytes, including the retired
    ZK dev tree. It is test data only, never an installation or release input.
    Keeping it immutable lets historical authorization tests survive dependency
    removals without broadening any deployment exception.
    """
    return gzip.decompress(
        (Path(__file__).parent / 'fixtures/deploy-push-lock.json.gz').read_bytes()
    )
