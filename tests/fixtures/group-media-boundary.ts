import assert from 'node:assert/strict';
import { sealFile } from '../../src/client/attachment-crypto/index.ts';
import {
  chatFileLimit,
  partLimit,
} from '../../src/shared/attachments/index.ts';
import { encode } from '../../src/shared/account/index.ts';

/** Exercise real encryption, every durable part and finalization through the existing service. */
export async function completeLargeGroupUpload(
  scope: { groupId: string; head: string; message: string },
  send: (operation: string, data: Record<string, unknown>) => Promise<unknown>,
): Promise<void> {
  const sealed = await sealFile(
    new Uint8Array(chatFileLimit).fill(0x42),
    chatFileLimit,
  );
  assert.equal(sealed.file.ref.parts.length, 39);
  await send('group-attachment-reserve', { ...scope, refs: [sealed.file.ref] });
  try {
    for (let index = 0; index < sealed.file.ref.parts.length; index++) {
      await send('group-attachment-part', {
        groupId: scope.groupId,
        head: scope.head,
        id: sealed.file.ref.id,
        index,
        ciphertext: encode(
          sealed.bytes.subarray(index * partLimit, (index + 1) * partLimit),
        ),
      });
    }
    await send('group-attachment-finish', {
      groupId: scope.groupId,
      head: scope.head,
      id: sealed.file.ref.id,
    });
  } finally {
    await send('group-attachment-cancel', scope);
  }
}
