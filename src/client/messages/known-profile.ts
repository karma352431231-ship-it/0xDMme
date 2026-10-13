import { localGet, openLocal } from '../message-storage/index.ts';
import type { LocalCipher } from '../message-storage/index.ts';
import { profileCard } from '../message-profile/index.ts';
import type { ProfileCard } from '../message-profile/index.ts';
import type { VaultAuthority } from '../vault-authority/index.ts';

/** Only a previously verified, locally received private card; never a public lookup. */
export async function knownPeerProfile(
  authority: VaultAuthority,
  peer: string,
): Promise<ProfileCard | null> {
  const scope = authority.session.accountId;
  const id = await localGet<string>(scope, `profile-current:${peer}:false`);
  if (!id) return null;
  const row = await localGet<{
    id: string;
    peer: string;
    own: boolean;
    sequence: number;
    draft: LocalCipher[];
  }>(scope, `profile:${id}`);
  if (!row) return null;
  if (row.id !== id || row.peer !== peer || row.own)
    throw new Error('Cartão de perfil local divergente.');
  const removed = await localGet<number>(
    scope,
    `profile-tombstone:${peer}:false`,
  );
  if (removed !== null && removed >= row.sequence) return null;
  const text = (
    await Promise.all(row.draft.map((chunk) => openLocal(authority, chunk)))
  ).join('');
  return profileCard(JSON.parse(text) as unknown);
}
