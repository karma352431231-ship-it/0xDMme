import { initAsync, StoreHandle } from '@matrix-org/matrix-sdk-crypto-wasm';
import { localStoreKey } from '../message-storage/index.ts';
import { MessageCrypto } from '../message-crypto/index.ts';
import type { MessageTransport } from '../message-crypto/index.ts';
import type { VaultAuthority } from '../vault-authority/index.ts';
/** The caller holds VaultAccess serialization, shared by direct conversations and groups. */
export async function openMessageMachine(
  a: VaultAuthority,
  transport: MessageTransport,
): Promise<MessageCrypto> {
  await initAsync('/matrix-crypto-18.9.0.wasm');
  const key = await localStoreKey(a);
  try {
    const store = await StoreHandle.openWithKey(
      `0xdmme-olm-${a.session.accountId}-${a.session.deviceId}`,
      key,
    );
    return await MessageCrypto.create({
      accountId: a.session.accountId,
      deviceId: a.session.deviceId,
      store,
      transport,
    });
  } finally {
    key.fill(0);
  }
}
