"""Pinned permissive research candidate; no policy decision or publication side effect."""
import hashlib
import io
import json
import sys
from pathlib import Path

MODEL_HASH = '3c59deeabdc2d29295bf8e3ac7abc5aa6c90fa1d76f4c9df198b903e815d170e'
PREPROCESSOR_HASH = 'f678895d3b0b6d95f32b0ab9d683c127c69b5f45939f82932cb90eb58bffa51e'
LABELS = ('safe', 'hentai', 'porn', 'sexy', 'drawing')


class Detector:
    def __init__(self, root):
        sys.path.insert(0, str(root / 'runtime'))
        import numpy as np
        import onnxruntime as ort
        from PIL import Image
        if np.__version__ != '2.3.5' or ort.__version__ != '1.24.4' or Image.__version__ != '12.3.0':
            raise RuntimeError('Candidate runtime differs from reviewed versions.')
        self.np, self.Image = np, Image
        Image.MAX_IMAGE_PIXELS = 20_000_000
        model = root / 'model/model.onnx'
        with model.open('rb') as stream:
            if hashlib.file_digest(stream, 'sha256').hexdigest() != MODEL_HASH:
                raise RuntimeError('Candidate model hash differs.')
        configuration = (root / 'model/preprocessor_config.json').read_bytes()
        if hashlib.sha256(configuration).hexdigest() != PREPROCESSOR_HASH:
            raise RuntimeError('Candidate preprocessing hash differs.')
        config = json.loads(configuration)
        if (config['size'] != {'height': 224, 'width': 224} or config['resample'] != 0
                or config['do_center_crop'] or config['rescale_offset'] or not config['include_top']):
            raise RuntimeError('Unsupported preprocessing configuration.')
        self.factor = config['rescale_factor']
        self.mean = np.array(config['image_mean'], dtype=np.float32)
        self.std = np.array(config['image_std'], dtype=np.float32)
        ort.disable_telemetry_events()
        options = ort.SessionOptions()
        options.intra_op_num_threads = 4
        options.inter_op_num_threads = 1
        options.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
        options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        options.add_session_config_entry('session.intra_op.allow_spinning', '0')
        options.add_session_config_entry('session.inter_op.allow_spinning', '0')
        self.session = ort.InferenceSession(str(model), sess_options=options, providers=['CPUExecutionProvider'])
        if self.session.get_providers() != ['CPUExecutionProvider']:
            raise RuntimeError('Unexpected inference provider.')

    def classify(self, payload, mime):
        import warnings
        np, Image = self.np, self.Image
        formats = {'image/png': 'PNG', 'image/jpeg': 'JPEG', 'image/webp': 'WEBP'}
        with warnings.catch_warnings():
            warnings.simplefilter('error', Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(payload)) as image:
                if image.format != formats[mime] or getattr(image, 'n_frames', 1) != 1 or image.width * image.height > 20_000_000:
                    raise ValueError('Static image required.')
                rgb = image.convert('RGB')
                try:
                    resized = rgb.resize((224, 224), Image.Resampling.NEAREST)
                    try:
                        pixels = (np.asarray(resized).astype(np.float64) * self.factor).astype(np.float32)
                        pixels = ((pixels - self.mean) / self.std) / self.std
                        prepared = np.ascontiguousarray(pixels.transpose(2, 0, 1)[None], dtype=np.float32)
                    finally:
                        resized.close()
                finally:
                    rgb.close()
        scores = self.session.run(['scores'], {'pixels': prepared})[0]
        if (scores.shape != (1, 5) or not np.isfinite(scores).all() or np.any(scores < 0)
                or np.any(scores > 1) or abs(float(scores.sum()) - 1) > 0.00001):
            raise RuntimeError('Invalid candidate result.')
        return {label: float(score) for label, score in zip(LABELS, scores[0])}

    def preview(self, payload):
        # Only called after classify validates the original. Thumbnails never feed inference.
        from PIL import ImageOps
        with self.Image.open(io.BytesIO(payload)) as original:
            with ImageOps.exif_transpose(original) as oriented:
                with oriented.convert('RGBA') as image:
                    image.thumbnail((320, 320), self.Image.Resampling.LANCZOS)
                    with io.BytesIO() as output:
                        image.save(output, format='PNG')
                        return output.getvalue()
