import { sign } from '../../shared/devices/index.ts';

/** Keep a cached signing capability separate from content/wrapping key closures. */
export function authoritySignature(
  key: CryptoKey,
  assertCurrent: () => void,
): (proof: string) => Promise<string> {
  return async (proof) => {
    assertCurrent();
    const signature = await sign(key, proof);
    assertCurrent();
    return signature;
  };
}
