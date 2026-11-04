import type { DmDeletionPacket } from '../../shared/dm-deletion/index.ts';
import type { BackupRecord } from '../backup-records/index.ts';
import type { VaultAuthority } from '../vault-authority/index.ts';
import {
  localGet,
  localPut,
  openLocal,
  sealLocal,
} from '../message-storage/index.ts';
import type { LocalCipher } from '../message-storage/index.ts';
import { forgetDmRecord, relatedDmHistory } from '../local-history/index.ts';
import { forgetAttachment } from '../attachments/index.ts';

/** Only a verified public author command may persist this encrypted anti-resurrection marker. */
export async function rememberDmDeletion(
  a: VaultAuthority,
  packet: DmDeletionPacket,
): Promise<void> {
  const name = `dm-author-deleted:${packet.id}`;
  const marker = await sealLocal(
    a,
    packet.id,
    JSON.stringify({ hash: packet.hash, author: packet.sender }),
  );
  await localPut(a.session.accountId, name, marker, marker.bytes.length + 512);
  const actions = await relatedDmHistory(a, [packet.id], () => {});
  for (const id of [packet.id, ...actions.map((action) => action.id)]) {
    await forgetDmRecord(a.session.accountId, id);
    await forgetAttachment(`dm-media:${a.session.accountId}`, id);
  }
}
export async function filterDeletedDmRoots<
  T extends Extract<BackupRecord, { type: 'dm-message' }>,
>(a: VaultAuthority, roots: readonly T[]): Promise<T[]> {
  const kept: T[] = [];
  for (const root of roots) {
    const held = await localGet<LocalCipher>(
      a.session.accountId,
      `dm-author-deleted:${root.id}`,
    );
    if (!held) {
      kept.push(root);
      continue;
    }
    const marker: unknown = JSON.parse(await openLocal(a, held));
    if (
      typeof marker !== 'object' ||
      marker === null ||
      !('hash' in marker) ||
      marker.hash !== root.hash
    )
      throw new Error('Deleted message identity does not match.');
  }
  return kept;
}

export async function filterDeletedDmResults<T extends { id: string }>(
  a: VaultAuthority,
  rows: readonly T[],
): Promise<T[]> {
  const kept: T[] = [];
  for (const row of rows) {
    const marker = await localGet<LocalCipher>(
      a.session.accountId,
      `dm-author-deleted:${row.id}`,
    );
    if (marker) await openLocal(a, marker);
    else kept.push(row);
  }
  return kept;
}
