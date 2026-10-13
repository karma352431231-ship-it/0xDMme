"""Reproduce source text embeddings offline with the previously reviewed encoder.

Requires the existing research Python environment, never the app's Node runtime.
No images, training, downloads, model adoption or publication side effects.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import signal
import sys

PINNED = {'config.json': '1284cbff35169abb23a1c5525a8b0f543c7bd191d4b9aed63880c1571bc4191c', 'preprocessor_config.json': '910e70b3956ac9879ebc90b22fb3bc8a75b6a0677814500101a4c072bd7857bd', 'tokenizer.json': 'b556ac8c99757ffb677208af34bc8c6721572114111a6e0aaf5fa69ff0b8d842', 'tokenizer_config.json': 'e19f34ef773563fb695f96cfcae1e4c7b112ab6ad532f6962061df5242d924f0', 'special_tokens_map.json': 'f8c0d6c39aee3f8431078ef6646567b0aba7f2246e9c54b8b99d55c22b707cbf', 'vocab.json': '5047b556ce86ccaf6aa22b3ffccfc52d391ea4accdab9c2f2407da5b742d4363', 'merges.txt': 'f1cd414c2d113a28b296afc0fd66ae854c0e0c34d5de373a2f5b7f62e0c02344', 'model.safetensors': '74813fbcdc750f235c9784c367ca1394d2a5c25eb0aac92761752ac239db7cff'}

def offline(event, _args):
    if event in ('socket.connect', 'socket.getaddrinfo'):
        raise RuntimeError('Offline text encoding required.')

def deadline(*_args):
    raise TimeoutError('Text encoding deadline exceeded.')

def encode(directory):
    for name, expected in PINNED.items():
        path = directory / name
        if path.is_symlink() or not path.is_file():
            raise ValueError('Pinned encoder file required.')
        with path.open('rb') as source:
            if hashlib.file_digest(source, 'sha256').hexdigest() != expected:
                raise ValueError('Frozen encoder artifact differs.')
    import torch
    from transformers import CLIPModel, AutoTokenizer
    torch.set_num_threads(4)
    torch.set_num_interop_threads(1)
    taxonomy = Path(__file__).parents[1] / 'public-moderation/pose_taxonomy.json'
    texts = json.loads(taxonomy.read_text())['ordinary_clothed']
    model = CLIPModel.from_pretrained(directory, local_files_only=True,
                                     trust_remote_code=False, use_safetensors=True).eval()
    tokenizer = AutoTokenizer.from_pretrained(directory, local_files_only=True,
                                             trust_remote_code=False)
    with torch.inference_mode():
        values = model.get_text_features(**tokenizer(texts, padding=True, return_tensors='pt'))
        return (values / values.norm(dim=-1, keepdim=True)).numpy()

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--encoder', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    for key in ('HF_HUB_OFFLINE', 'TRANSFORMERS_OFFLINE', 'HF_HUB_DISABLE_TELEMETRY', 'DO_NOT_TRACK'):
        os.environ[key] = '1'
    sys.addaudithook(offline)
    signal.signal(signal.SIGALRM, deadline)
    signal.alarm(150)
    result = encode(args.encoder)
    import numpy as np
    if result.dtype != np.float32 or result.shape != (6, 512) or not np.isfinite(result).all():
        raise ValueError('Unexpected ordinary-context vectors.')
    np.save(args.output, result, allow_pickle=False)
    expected = Path(__file__).parents[1] / 'public-moderation/ordinary_clothed.npy'
    if args.output.read_bytes() != expected.read_bytes():
        raise RuntimeError('Encoder did not reproduce the exact source artifact.')
    signal.alarm(0)
    print(json.dumps({'reproducedExactly': True, 'training': False, 'imageInputs': False}))

if __name__ == '__main__':
    main()
