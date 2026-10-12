"""Offline CPU inference, exact neutral proof first; no publication side effect."""
import json
from contextlib import closing
import sys
from pathlib import Path
from pose_artifacts import verify_artifacts
from pose_views import CanonicalViews
from visible_pixels import neutral_rgba_reason
from fusion_policy import classify


class PoseDetector:
    def __init__(self, root):
        import numpy as np
        import onnxruntime as ort
        from PIL import Image
        if (sys.version_info[:2] != (3, 12) or np.__version__ != '2.3.5'
                or ort.__version__ != '1.24.4' or Image.__version__ != '12.3.0'):
            raise RuntimeError('Unreviewed inference runtime.')
        root = verify_artifacts(root)
        self.np, self.views = np, CanonicalViews()
        ort.disable_telemetry_events()
        self.context = self._session(root / 'context.onnx', ort)
        self.nano = self._session(root / 'nano.onnx', ort)
        taxonomy = json.loads(Path(__file__).with_name('pose_taxonomy.json').read_text())
        self.groups = [key for key, values in taxonomy.items() for _ in values]
        self.categories = list(taxonomy)
        self.text = np.load(root / 'text.npy', allow_pickle=False)
        if (self.text.shape != (len(self.groups), 512) or self.text.dtype != np.float32
                or not np.isfinite(self.text).all()):
            raise ValueError('Invalid frozen text matrix.')
        config = json.loads((root / 'nano-preprocessor.json').read_text())
        self.factor = config['rescale_factor']
        self.mean = np.array(config['image_mean'], dtype=np.float32)
        self.std = np.array(config['image_std'], dtype=np.float32)
        self.nano_labels = ('safe', 'hentai', 'porn', 'sexy', 'drawing')

    @staticmethod
    def _session(path, ort):
        options = ort.SessionOptions()
        options.intra_op_num_threads, options.inter_op_num_threads = 4, 1
        options.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
        for key in ('session.intra_op.allow_spinning', 'session.inter_op.allow_spinning'):
            options.add_session_config_entry(key, '0')
        session = ort.InferenceSession(str(path), sess_options=options, providers=['CPUExecutionProvider'])
        if session.get_providers() != ['CPUExecutionProvider']:
            raise ValueError('Unexpected inference provider.')
        return session

    def _context_scores(self, inputs):
        np = self.np
        unique, owners, known = [], [], {}
        for value in inputs:
            key = value.tobytes()
            if key not in known:
                known[key] = len(unique)
                unique.append(value)
            owners.append(known[key])
        features = self.context.run(['features'], {'pixels': np.stack(unique)})[0]
        if features.shape != (len(unique), 512) or not np.isfinite(features).all():
            raise ValueError('Invalid contextual inference.')
        norms = np.linalg.norm(features, axis=1, keepdims=True)
        if np.any(norms <= 0):
            raise ValueError('Invalid contextual feature norm.')
        scores = (features / norms @ self.text.T)[owners]
        if not np.isfinite(scores).all() or np.any(np.abs(scores) > 1.000001):
            raise ValueError('Invalid contextual similarities.')
        return [{key: max(float(v) for group, v in zip(self.groups, row) if group == key)
                 for key in self.categories} for row in scores]

    def _nano_scores(self, images):
        np, Image = self.np, self.views.Image
        inputs = []
        for image in images:
            with image.resize((224, 224), Image.Resampling.NEAREST) as resized:
                pixels = (np.asarray(resized).astype(np.float64) * self.factor).astype(np.float32)
                inputs.append((((pixels - self.mean) / self.std) / self.std).transpose(2, 0, 1))
        scores = self.nano.run(['scores'], {'pixels': np.ascontiguousarray(np.stack(inputs))})[0]
        if (scores.shape != (len(inputs), 5) or not np.isfinite(scores).all()
                or np.any(scores < 0) or np.any(scores > 1)
                or np.max(np.abs(scores.sum(axis=1) - 1)) > 0.00001):
            raise ValueError('Invalid generic inference.')
        return [dict(zip(self.nano_labels, map(float, row))) for row in scores]

    def classify_prepared(self, frames, shape):
        verdicts = []
        for native, context in frames:
            reason = neutral_rgba_reason(native, **shape['native'])
            if reason:
                verdicts.append('allow')
                continue
            inputs, nano = [], []
            with closing(self.views.composed_views(context, shape['context'])) as composed:
                for views, images in composed:
                    inputs.extend(views)
                    nano.extend(self._nano_scores(images))
            verdicts.append(classify(self._context_scores(inputs), nano)['verdict'])
        return verdicts
