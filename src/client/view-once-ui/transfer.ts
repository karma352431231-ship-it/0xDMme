import { base64, encode } from '../../shared/account/index.ts';
import type { ViewOnceContent } from '../../shared/view-once/index.ts';
import { timedLoad, timedLoadSync } from '../chat-sync-diagnostics/index.ts';
import type { LoadTrace } from '../chat-sync-diagnostics/index.ts';
import type { ProtectedDisplay } from './display.ts';

/** Owns the temporary binary copy through the last native append acknowledgement. */
export async function transferProtected(input: {
  display: ProtectedDisplay;
  id: string;
  content: ViewOnceContent;
  signal: AbortSignal;
  diagnostic?: LoadTrace | undefined;
}): Promise<void> {
  const file = input.content.file;
  const bytes = timedLoadSync(input.diagnostic, 'native-payload-decode', () =>
    file ? Uint8Array.from(base64(file.data, 10_000_000)) : null,
  );
  const size = bytes?.length ?? 0;
  input.diagnostic?.point('native-transfer', {
    loadTransferPlannedBytes: size,
    loadTransferPlannedBlocks: Math.ceil(size / 65536),
    loadTransferBytes: 0,
    loadTransferBlocks: 0,
  });
  try {
    if (!bytes) return;
    for (let offset = 0; offset < bytes.length; offset += 65536) {
      input.signal.throwIfAborted();
      const part = bytes.subarray(offset, offset + 65536);
      const encoded = timedLoadSync(
        input.diagnostic,
        'native-payload-encode',
        () => encode(part),
      );
      await timedLoad(input.diagnostic, 'native-append', () =>
        input.display.append({ id: input.id, offset, bytes: encoded }),
      );
      input.diagnostic?.point('native-transfer', {
        loadTransferBytes: offset + part.length,
        loadTransferBlocks: Math.floor(offset / 65536) + 1,
      });
    }
  } finally {
    bytes?.fill(0);
  }
}
