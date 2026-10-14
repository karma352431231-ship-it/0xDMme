import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const reviewed = new Map([
  [
    'metamask.svg',
    'a927489dbf4bdf79726e0bfff6c5c4c8336452e65da43c50d5ca96b323ffdd2b',
  ],
  [
    'phantom.svg',
    'f0568a024a8290d744ee7a548839ab9db336357a3fe1b8efcd881d8da1e57013',
  ],
  [
    'backpack.png',
    '1b6e91e5c3778ca6a51a8ecbc9fcf05330c3060cec12ef4ea05cf873586a970d',
  ],
]);

/** Graphics only. The app does not import or install any wallet SDK. */
export async function frontendWalletMarks(
  root: string,
): Promise<Map<string, Uint8Array>> {
  const result = new Map<string, Uint8Array>();
  for (const [name, checksum] of reviewed) {
    const bytes = await readFile(resolve(root, 'vendor/wallet-marks', name));
    if (createHash('sha256').update(bytes).digest('hex') !== checksum)
      throw new Error('Wallet mark differs from its reviewed original.');
    result.set(`wallet-${name}`, bytes);
  }
  return result;
}
