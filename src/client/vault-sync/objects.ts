import { base64, object } from '../../shared/account/index.ts';
import { blockLimit } from '../../shared/vault/index.ts';
import type { VaultCommit } from '../../shared/vault/index.ts';
import type { VaultAuthority } from '../vault-authority/index.ts';
import { cacheBlock, cachedBlock } from '../vault-storage/index.ts';
import { openBlock } from '../vault-crypto/index.ts';
import { vaultApi } from './api.ts';

interface ObjectRead {
  authority: VaultAuthority;
  entries: ReadonlyMap<string, { commit: VaultCommit }>;
  removed: (id: string) => boolean;
  guard: () => void;
}

/** The caller verifies current authority and removals before each bounded page.
 * Cached bytes are ciphertext, checked against the authenticated immutable
 * commit and decrypted with its AAD. Corruption never falls back to the server. */
export async function openVaultObjects(
  read: ObjectRead,
  ids: readonly string[],
): Promise<string[]> {
  const values: string[] = [];
  for (const id of ids) {
    read.guard();
    const commit = availableCommit(read, id);
    const account = read.authority.session.accountId;
    const cached = await cachedBlock(account, id);
    read.guard();
    const bytes = cached ?? (await fetchObject(read.authority, id));
    read.guard();
    const value = await openBlock(
      await read.authority.key(commit.epoch),
      commit,
      bytes,
    );
    read.guard();
    if (!cached) await cacheBlock(account, id, bytes);
    read.guard();
    values.push(value);
  }
  return values;
}

export function assertVaultObjectsAvailable(
  read: ObjectRead,
  ids: readonly string[],
): void {
  read.guard();
  for (const id of ids) availableCommit(read, id);
}

function availableCommit(read: ObjectRead, id: string): VaultCommit {
  const entry = read.entries.get(id);
  if (!entry) throw new Error('Carregue esta versão primeiro.');
  if (entry.commit.accountId !== read.authority.session.accountId)
    throw new Error('Manifesto de outra conta.');
  if (read.removed(id))
    throw new Error(
      'Versão removida do cofre pessoal. Consulte o backup independente.',
    );
  return entry.commit;
}

async function fetchObject(
  authority: VaultAuthority,
  id: string,
): Promise<Uint8Array> {
  if (authority.offline)
    throw new Error(
      'Este bloco ainda não está no aparelho. Reconecte para carregar.',
    );
  const data = object(await vaultApi(authority, 'object', { id }));
  if (data['id'] !== id) throw new Error('Objeto divergente.');
  return base64(data['ciphertext'], blockLimit);
}
