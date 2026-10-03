import { openFile, sealFile } from '../attachment-crypto/index.ts';
import {
  assertFileAllowed,
  imageShape,
  preparePhoto,
} from '../attachment-images/index.ts';
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
  | { operation: 'original'; file: File };
const scope = globalThis as unknown as Scope;
async function run(data: Request): Promise<unknown> {
  if (data.operation === 'photo') return preparePhoto(data.file);
  if (data.operation === 'seal') return sealFile(data.bytes, data.maximum);
  if (data.operation === 'open') {
    const bytes = await openFile(data.file, data.bytes, data.maximum);
    if (data.image) imageShape(bytes, 4_194_304);
    return { bytes };
  }
  if (!data.file.size || data.file.size > 3_000_000)
    throw new Error('Arquivo deve ter até 3 MB.');
  const bytes = new Uint8Array(await data.file.arrayBuffer());
  assertFileAllowed(data.file.name, data.file.type, bytes);
  return { bytes };
}
scope.addEventListener('message', (event) => {
  void run(event.data)
    .then((result) => scope.postMessage({ result }, []))
    .catch(() => {
      scope.postMessage(
        {
          error:
            'Não foi possível processar o anexo. Confira formato, tamanho, pixels e suporte do navegador.',
        },
        [],
      );
    });
});
