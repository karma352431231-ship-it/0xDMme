import { initAsync } from '@matrix-org/matrix-sdk-crypto-wasm';

/** Public runtime only: loading never needs account keys or the vault lock.
 * The SDK shares one initialization promise across direct/group/recovery users. */
export function prepareMessageRuntime(): Promise<void> {
  return initAsync('/matrix-crypto-18.9.0.wasm');
}
