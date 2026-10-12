"""Canonical spatial/alpha views, equivalent to the frozen local evaluation."""


class CanonicalViews:
    def __init__(self):
        import numpy as np
        from PIL import Image, ImageOps
        self.np, self.Image, self.ImageOps = np, Image, ImageOps
        self.mean = np.array([0.48145466, 0.4578275, 0.40821073], dtype=np.float32)
        self.std = np.array([0.26862954, 0.26130258, 0.27577711], dtype=np.float32)

    def prepare_context(self, image):
        np, Image = self.np, self.Image
        width, height = image.size
        target = ((224, int(224 * height / width)) if width <= height
                  else (int(224 * width / height), 224))
        with image.resize(target, Image.Resampling.BICUBIC) as resized:
            left, top = (target[0] - 224) // 2, (target[1] - 224) // 2
            with resized.crop((left, top, left + 224, top + 224)) as center:
                values = (np.asarray(center).astype(np.float64) * (1 / 255)).astype(np.float32)
                return np.ascontiguousarray(((values - self.mean) / self.std).transpose(2, 0, 1))

    def whole_context(self, rgb):
        ratio = min(224 / rgb.width, 224 / rgb.height)
        width, height = round(rgb.width * ratio), round(rgb.height * ratio)
        if width and height:
            return self.ImageOps.pad(rgb, (224, 224), method=self.Image.Resampling.BICUBIC,
                                     color=(127, 127, 127))
        with rgb.resize((max(1, width), max(1, height)), self.Image.Resampling.BICUBIC) as contained:
            whole = self.Image.new('RGB', (224, 224), (127, 127, 127))
            whole.paste(contained, (round((224 - max(1, width)) / 2),
                                   round((224 - max(1, height)) / 2)))
            return whole

    def composed_views(self, pixels, shape):
        Image = self.Image
        with Image.frombytes('RGBA', (512, 512), pixels) as frame:
            left, top, width, height = (shape[key] for key in ('left', 'top', 'width', 'height'))
            with frame.crop((left, top, left + width, top + height)) as full:
                with full.getchannel('A') as alpha:
                    opaque = alpha.getextrema() == (255, 255)
                for background in ((0,) if opaque else (0, 255)):
                    with Image.new('RGBA', full.size, (background,) * 3 + (255,)) as canvas:
                        with Image.alpha_composite(canvas, full) as composed, composed.convert('RGB') as rgb:
                            with self.whole_context(rgb) as whole:
                                context = [self.prepare_context(rgb), self.prepare_context(whole)]
                            if rgb.width == rgb.height:
                                context[1] = context[0].copy()
                            size = min(rgb.size)
                            x, y = (rgb.width - size) // 2, (rgb.height - size) // 2
                            with rgb.crop((x, y, x + size, y + size)) as center:
                                yield context, [center, rgb]
