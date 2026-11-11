import { decodeCanonicalBase64 } from '../../src/shared/base64/index.ts';

/** Isolated WebView, synthetic 128 KiB chunks, no app document/bridge/network. */
export function runDecoderBenchmark() {
  const bytes = new Uint8Array(131072);
  for (let i = 0; i < bytes.length; i++) bytes[i] = i % 256;
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  const encoded = btoa(binary);
  const codecs = {
    baseline: (value: string) => {
      if (
        !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(
          value,
        )
      )
        throw new Error('Invalid synthetic base64.');
      const decoded = atob(value);
      if (btoa(decoded) !== value) throw new Error('Invalid synthetic base64.');
      return Uint8Array.from(decoded, (char) => char.charCodeAt(0));
    },
    loop: (value: string) => {
      const decoded = atob(value);
      if (btoa(decoded) !== value) throw new Error('Invalid synthetic base64.');
      const result = new Uint8Array(decoded.length);
      for (let i = 0; i < result.length; i++) result[i] = decoded.charCodeAt(i);
      return result;
    },
    candidate: (value: string) => decodeCanonicalBase64(value, bytes.length),
  };
  const trials: Record<string, number[]> = {};
  for (const [name, decode] of Object.entries(codecs)) {
    trials[name] = [];
    for (let trial = 0; trial < 6; trial++) {
      const elapsed = trialDecoder(decode, encoded, bytes);
      if (trial) trials[name].push(elapsed);
    }
  }
  return {
    blockBytes: bytes.length,
    blocksPerTrial: 8,
    trialsUs: trials,
    nativeDecoder: typeof Reflect.get(Uint8Array, 'fromBase64') === 'function',
  };
}

function trialDecoder(
  decode: (value: string) => Uint8Array,
  encoded: string,
  expected: Uint8Array,
): number {
  let total = 0;
  for (let block = 0; block < 8; block++) {
    const start = performance.now();
    const result = decode(encoded);
    total += performance.now() - start;
    if (
      result.length !== expected.length ||
      result.some((v, i) => v !== expected[i])
    )
      throw new Error('Synthetic bytes differ.');
    result.fill(0);
  }
  return Math.round(total * 1000);
}
