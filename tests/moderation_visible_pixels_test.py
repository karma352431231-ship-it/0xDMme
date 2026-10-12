import importlib.util
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    'visible_pixels', ROOT / 'infra/public-moderation/visible_pixels.py')
visible_pixels = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(visible_pixels)
neutral = visible_pixels.neutral_rgba_reason


class VisiblePixelsTests(unittest.TestCase):
    def test_uniform_color_is_neutral_for_every_alpha_and_geometry(self):
        for width, height in ((1, 1), (1, 2048), (2048, 1), (512, 288), (129, 257)):
            for alpha in (0, 1, 128, 254, 255):
                with self.subTest(width=width, height=height, alpha=alpha):
                    rgba = bytes((37, 89, 131, alpha)) * (width * height)
                    self.assertIsNotNone(neutral(rgba, width=width, height=height))

    def test_invisible_rgb_structure_has_no_visible_content(self):
        rgba = bytes((255, 0, 0, 0, 0, 255, 0, 0, 0, 0, 255, 0))
        self.assertEqual(neutral(rgba, width=3, height=1),
                         'fully-transparent-prepared-frame')

    def test_one_different_pixel_never_qualifies_for_neutral_permission(self):
        count = 109 * 301
        base = bytes((0, 0, 0, 255)) * count
        for index in (0, 16_383, 16_384, count // 2, count - 1):
            for channel in range(4):
                with self.subTest(index=index, channel=channel):
                    changed = bytearray(base)
                    changed[index * 4 + channel] ^= 1
                    self.assertIsNone(neutral(bytes(changed), width=109, height=301))

    def test_one_visible_pixel_in_an_invisible_frame_requires_inference(self):
        rgba = bytearray(bytes((255, 0, 0, 0)) * 8)
        for index in range(8):
            modified = bytearray(rgba)
            modified[index * 4 + 3] = 1
            self.assertIsNone(neutral(bytes(modified), width=4, height=2))

    def test_nonuniform_transparency_is_never_a_color_exception(self):
        self.assertIsNone(neutral(bytes((255, 0, 0, 127, 255, 0, 0, 128)),
                                  width=2, height=1))

    def test_invalid_envelopes_fail_without_neutral_permission(self):
        for width, height, rgba in (
                (0, 1, b''), (2049, 1, b''), (1, -1, b''), (True, 1, b'1234'),
                (1.0, 1, b'1234'), (1, 1, b'123'), (1, 1, b'12345'),
                (1, 1, bytearray(b'1234')), (1, 1, memoryview(b'1234'))):
            with self.subTest(width=width, height=height, kind=type(rgba).__name__):
                with self.assertRaises(ValueError):
                    neutral(rgba, width=width, height=height)


if __name__ == '__main__':
    unittest.main()
