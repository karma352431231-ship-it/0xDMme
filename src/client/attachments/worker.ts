import type {
  CryptoReporter,
  CryptoTiming,
} from '../../shared/chat-sync-diagnostics/crypto.ts';
import { openFile, sealFile } from '../attachment-crypto/index.ts';
import {
  imageShape,
  preparePhoto,
  prepareOriginal,
} from '../attachment-images/index.ts';
import {
  thumbnailLimit,
  chatFileLimit,
  fileLimit,
  fileLimitMessage,
  oversizedFileMessage,
} from '../../shared/attachments/index.ts';
import type { PrivateFile } from '../../shared/attachments/index.ts';
import {
  validateViewOnce,
  selectionContents,
  draftChunks,
  openDraft,
  serializeViewOnce,
} from '../view-once-preparation/index.ts';
import type { ValidatedViewOnce } from '../view-once-preparation/index.ts';
interface Scope {
  addEventListener(
    type: 'message',
    listener: (event: MessageEvent<Request>) => void,
  ): void;
  postMessage(value: unknown, transfer: Transferable[]): void;
}
type Request =
  | { operation: 'view-once-validate'; content: unknown }
  | {
      operation: 'view-once-selection';
      text: string;
      file: { name: string; type: string; bytes: Uint8Array } | null;
      maximum: number;
    }
  | { operation: 'view-once-seal-draft'; prepared: ValidatedViewOnce }
  | { operation: 'view-once-serialize'; prepared: ValidatedViewOnce }
  | { operation: 'view-once-open-draft'; chunks: string[] }
  | { operation: 'photo'; file: File }
  | { operation: 'seal'; bytes: Uint8Array; maximum: number }
  | {
      operation: 'open';
      file: PrivateFile;
      bytes: Uint8Array;
      maximum: number;
      image: boolean;
      diagnostic?: boolean;
    }
  | { operation: 'original'; file: File; maximum: number };
const scope = globalThis as unknown as Scope;
const actionableErrors = new Set([
  'Use an MP4 or MOV video.',
  'Use an MP4 or MOV video for view once.',
  'Write up to 16 KB of text.',
  'Write a message.',
  'Invalid view-once file.',
  'View-once draft exceeds the limit.',
  'View-once content exceeds the limit.',
  'File exceeds this conversation’s limit.',
  ...[fileLimit, chatFileLimit].flatMap((maximum) => [
    fileLimitMessage(maximum),
    oversizedFileMessage(maximum),
  ]),
]);
function viewOnceWork(
  data: Extract<Request, { operation: `view-once-${string}` }>,
): unknown {
  if (data.operation === 'view-once-validate')
    return validateViewOnce(data.content);
  if (data.operation === 'view-once-selection') return selectionContents(data);
  if (data.operation === 'view-once-open-draft') return openDraft(data.chunks);
  if (data.operation === 'view-once-seal-draft')
    return draftChunks(data.prepared);
  if (data.operation === 'view-once-serialize')
    return { bytes: serializeViewOnce(data.prepared) };
}
async function run(data: Request, report?: CryptoReporter): Promise<unknown> {
  if (isViewOnceWork(data)) return viewOnceWork(data);
  if (data.operation === 'photo') return preparePhoto(data.file);
  if (data.operation === 'seal') return sealFile(data.bytes, data.maximum);
  if (data.operation === 'open') {
    const bytes = await openFile(data.file, data.bytes, data.maximum, report);
    const validating = report ? performance.now() : 0;
    if (data.image)
      imageShape(
        bytes,
        data.maximum === thumbnailLimit ? 4_194_304 : 24_000_000,
      );
    report?.('decrypt-validate', Math.round(performance.now() - validating));
    return { bytes };
  }
  return prepareOriginal(data.file, data.maximum);
}
function isViewOnceWork(
  data: Request,
): data is Extract<Request, { operation: `view-once-${string}` }> {
  return data.operation.startsWith('view-once-');
}
scope.addEventListener('message', (event) => {
  const diagnostic: CryptoTiming[] = [];
  const report: CryptoReporter | undefined =
    event.data.operation === 'open' && event.data.diagnostic === true
      ? (stage, ms) => {
          if (diagnostic.length < 8) diagnostic.push({ stage, ms });
        }
      : undefined;
  void run(event.data, report)
    .then((result) => {
      const transfer =
        result &&
        typeof result === 'object' &&
        'bytes' in result &&
        result.bytes instanceof Uint8Array &&
        result.bytes.buffer instanceof ArrayBuffer
          ? [result.bytes.buffer]
          : [];
      scope.postMessage(
        { result, ...(report ? { diagnostic } : {}) },
        transfer,
      );
    })
    .catch((error: unknown) => {
      scope.postMessage(
        {
          ...(report ? { diagnostic } : {}),
          // Translate at the UI boundary. Loading the complete UI catalog in
          // every short-lived decoder/crypto worker wastes mobile memory.
          error:
            error instanceof Error && actionableErrors.has(error.message)
              ? error.message
              : 'Could not process the attachment. Check its format, size, pixels and browser support.',
        },
        [],
      );
    });
});
