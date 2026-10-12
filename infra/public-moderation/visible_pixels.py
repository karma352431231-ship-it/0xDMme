"""Exact neutral-frame evidence before any resize or crop.

This proves absence of visible structure for one complete decoded frame. It
does not classify nonuniform imagery or grant approval to an entire sequence.
Use only the byte owner's complete, prepared-resolution RGBA frame; resized
model tensors and thumbnails cannot stand in for it.
"""

MAXIMUM_PIXELS = 4_194_304
MAXIMUM_DIMENSION = 2048
MAXIMUM_CHUNK_BYTES = 65_536


def neutral_rgba_reason(pixels, *, width, height):
    """Return exact evidence, or None when contextual inference is required.

    bytes is intentionally immutable, preventing later mutation of an already
    checked buffer. Hidden RGB is irrelevant only when every alpha is zero.
    A single differing visible pixel prevents the uniform-color route.
    """
    if (type(width) is not int or type(height) is not int
            or not 1 <= width <= MAXIMUM_DIMENSION
            or not 1 <= height <= MAXIMUM_DIMENSION
            or width * height > MAXIMUM_PIXELS):
        raise ValueError('Invalid prepared-frame dimensions.')
    if type(pixels) is not bytes or len(pixels) != width * height * 4:
        raise ValueError('Complete immutable prepared RGBA pixels required.')
    view = memoryview(pixels)
    try:
        if not any(view[3::4]):
            return 'fully-transparent-prepared-frame'
        pixel = pixels[:4]
        expected = pixel * min(width * height, MAXIMUM_CHUNK_BYTES // 4)
        for offset in range(0, len(pixels), MAXIMUM_CHUNK_BYTES):
            chunk = view[offset:offset + MAXIMUM_CHUNK_BYTES]
            try:
                if chunk != expected[:len(chunk)]:
                    return None
            finally:
                chunk.release()
        return 'uniform-rgba-prepared-frame'
    finally:
        view.release()
