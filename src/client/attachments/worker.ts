import { openFile, sealFile } from '../attachment-crypto/index.ts';
import {
  imageShape,
  preparePhoto,
  prepareOriginal,
} from '../attachment-images/index.ts';
import { thumbnailLimit } from '../../shared/attachments/index.ts';
import type { PrivateFile } from '../../shared/attachments/index.ts';
interface Scope {
  addEventListener(
    type: 'message',
    listener: (event: MessageEvent<Request>) => void,
  ): void;
  postMessage(value: unknown, transfer: Transferable[]): void;
}
type Request =
  | { operation: 'photo'; file: File }
  | { operation: 'seal'; bytes: Uint8Array; maximum: number }
  | {
      operation: 'open';
      file: PrivateFile;
      bytes: Uint8Array;
      maximum: number;
      image: boolean;
    }
  | { operation: 'original'; file: File; maximum: number };
const scope = globalThis as unknown as Scope;
async function run(data: Request): Promise<unknown> {
  if (data.operation === 'photo') return preparePhoto(data.file);
  if (data.operation === 'seal') return sealFile(data.bytes, data.maximum);
  if (data.operation === 'open') {
    const bytes = await openFile(data.file, data.bytes, data.maximum);
    if (data.image)
      imageShape(
        bytes,
        data.maximum === thumbnailLimit ? 4_194_304 : 24_000_000,
      );
    return { bytes };
  }
  return prepareOriginal(data.file, data.maximum);
}
scope.addEventListener('message', (event) => {
  void run(event.data)
    .then((result) => scope.postMessage({ result }, []))
    .catch(() => {
      scope.postMessage(
        {
          // Translate at the UI boundary. Loading the complete UI catalog in
          // every short-lived decoder/crypto worker wastes mobile memory.
          error:
            'Could not process the attachment. Check its format, size, pixels and browser support.',
        },
        [],
      );
    });
});
