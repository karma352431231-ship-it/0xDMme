import { sealLocal } from '../message-storage/index.ts';
import type { LocalCipher } from '../message-storage/index.ts';
import type { VaultAuthority } from '../vault-authority/index.ts';

/** Same encrypted profile chunk format for outgoing cards and verified cache. */
export async function sealProfileChunks(
  a: VaultAuthority,
  text: string,
): Promise<LocalCipher[]> {
  const chunks: LocalCipher[] = [];
  for (let after = 0; after < text.length; after += 1_500_000)
    chunks.push(
      await sealLocal(
        a,
        crypto.randomUUID(),
        text.slice(after, after + 1_500_000),
      ),
    );
  return chunks;
}
