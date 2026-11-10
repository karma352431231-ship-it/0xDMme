export type FileKind = 'image' | 'video' | 'file' | 'unknown';
export interface InspectedFile {
  kind: FileKind;
  bytes: number;
  slot: string;
  signature: boolean;
  mismatch: boolean;
  inspectionMs: number;
}
/** Local-only serial reads. Private SHA-256 assigns per-capture file slots,
 * allowing identical bytes to be compared without exporting fingerprints. */
export class FileInspection {
  private readonly abort = new AbortController();
  private readonly fingerprints = new Map<string, string>();
  private tail: Promise<unknown> = Promise.resolve();
  private queued = 0;
  inspect(file: File): Promise<InspectedFile> {
    if (this.queued >= 16 || file.size > 16_000_000)
      return Promise.reject(new Error('Local inspection budget exceeded.'));
    this.queued++;
    const result = this.tail.then(() => this.run(file));
    this.tail = result.catch(() => {});
    return result.finally(() => {
      this.queued--;
    });
  }
  stop(): void {
    this.abort.abort();
    this.fingerprints.clear();
  }
  private async run(file: File): Promise<InspectedFile> {
    const started = performance.now();
    const bytes = new Uint8Array(await readFile(file, this.abort.signal));
    try {
      const kind = signatureKind(bytes);
      const declared = declaredKind(file.type);
      const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
      this.abort.signal.throwIfAborted();
      const fingerprint = Array.from(hash, (byte) =>
        byte.toString(16).padStart(2, '0'),
      ).join('');
      hash.fill(0);
      return {
        kind: kind ?? declared,
        bytes: bytes.length,
        slot: this.slot(fingerprint),
        signature: kind !== null,
        mismatch: kind !== null && declared !== 'unknown' && kind !== declared,
        inspectionMs: Math.max(0, Math.round(performance.now() - started)),
      };
    } finally {
      bytes.fill(0);
    }
  }
  private slot(hash: string): string {
    const known = this.fingerprints.get(hash);
    if (known) return known;
    if (this.fingerprints.size === 128) return '';
    const slot = `file-${this.fingerprints.size + 1}`;
    this.fingerprints.set(hash, slot);
    return slot;
  }
}
function readFile(file: File, signal: AbortSignal): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error('Local inspection stopped.'));
      return;
    }
    const reader = new FileReader();
    const cancel = () => reader.abort();
    const timer = setTimeout(cancel, 5000);
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', cancel);
    };
    signal.addEventListener('abort', cancel, { once: true });
    reader.onload = () => {
      finish();
      if (reader.result instanceof ArrayBuffer) resolve(reader.result);
      else reject(new Error('Local inspection failed.'));
    };
    reader.onerror = reader.onabort = () => {
      finish();
      reject(new Error('Local inspection unavailable.'));
    };
    try {
      reader.readAsArrayBuffer(file);
    } catch {
      finish();
      reject(new Error('Local inspection unavailable.'));
    }
  });
}
export function declaredKind(mime: string): FileKind {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  return mime === '' ? 'unknown' : 'file';
}
/** Format-family detection, not a decoder or a claim that the file is valid. */
function signatureKind(bytes: Uint8Array): FileKind | null {
  const starts = (prefix: readonly number[]) =>
    prefix.every((byte, index) => bytes[index] === byte);
  if (starts([137, 80, 78, 71, 13, 10, 26, 10]) || starts([255, 216, 255]))
    return 'image';
  const text = new TextDecoder().decode(bytes.subarray(0, 64));
  if (/^GIF8[79]a/u.test(text) || text.startsWith('BM')) return 'image';
  if (text.startsWith('RIFF')) return riffKind(text);
  if (text.slice(4, 8) === 'ftyp') return isoKind(text.slice(8, 12));
  if (text.startsWith('FLV') || starts([26, 69, 223, 163])) return 'video';
  return null;
}
function riffKind(text: string): FileKind | null {
  if (text.slice(8, 12) === 'WEBP') return 'image';
  return text.slice(8, 12) === 'AVI ' ? 'video' : null;
}
function isoKind(brand: string): FileKind | null {
  if (
    ['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1', 'avif', 'avis'].includes(
      brand,
    )
  )
    return 'image';
  if (brand === 'M4A ') return 'file';
  return /^(?:qt {2}|iso[m2-9]|mp4[12]|avc1|dash|M4V |MSNV)$/u.test(brand)
    ? 'video'
    : null;
}
