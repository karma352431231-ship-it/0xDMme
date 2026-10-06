import { keys, object, uuid } from '../account/index.ts';
import { eventHash, fingerprint, verify } from '../devices/index.ts';
import type { DirectoryEvent } from '../devices/index.ts';
import { integer } from '../vault/index.ts';
import { messageBody, messageProof } from '../messages/index.ts';
import type { MessageProof } from '../messages/index.ts';

export const backupLimit = 4 * 1024 * 1024 * 1024;
export const backupFrameLimit = 65536;
export const backupReportLimit = 32_000_000;
export const backupChunk = 262144;
export const backupRecordLimit = 6_000_000;
export const backupItemLimit = 65536;
export interface BackupTarget {
  kind: 'vault' | 'message' | 'dm-message';
  id: string;
  hash: string;
}
export function backupTarget(value: unknown): BackupTarget {
  const d = object(value);
  keys(d, ['kind', 'id', 'hash']);
  if (!['vault', 'message', 'dm-message'].includes(String(d['kind'])))
    throw new Error('Tipo de seleção inválido.');
  return {
    kind: d['kind'] as BackupTarget['kind'],
    id: uuid(d['id']),
    hash: fingerprint(d['hash']),
  };
}
export function cleanupSelection(proof: MessageProof): {
  backup: string;
  revision: number;
  items: BackupTarget[];
} {
  const d = proof.payload;
  keys(d, ['backup', 'revision', 'items']);
  if (!Array.isArray(d['items']) || !d['items'].length || d['items'].length > 8)
    throw new Error('Limpeza exige de um a oito itens por lote.');
  const items = d['items']
    .map(backupTarget)
    .sort((a, b) => `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`));
  if (new Set(items.map((i) => `${i.kind}:${i.id}`)).size !== items.length)
    throw new Error('Seleção repetida.');
  return {
    backup: fingerprint(d['backup']),
    revision: integer(d['revision'], 128),
    items,
  };
}
export interface PersonalRemoval extends BackupTarget {
  sequence: number;
  proof: MessageProof;
}
export function personalRemoval(value: unknown): PersonalRemoval {
  const d = object(value);
  const target = backupTarget({
    kind: d['kind'],
    id: d['id'],
    hash: d['hash'],
  });
  return {
    ...target,
    sequence: integer(d['sequence'], Number.MAX_SAFE_INTEGER),
    proof: messageProof(d['proof']),
  };
}
export async function verifyRemoval(
  account: string,
  removal: PersonalRemoval,
  events: DirectoryEvent[],
): Promise<void> {
  const proof = removal.proof;
  const selection = cleanupSelection(proof);
  const event = events[selection.revision - 1];
  const signer = event?.devices.find((d) => d.id === proof.deviceId);
  if (
    !event ||
    !signer ||
    event.accountId !== account ||
    (await eventHash(event)) !== proof.directory ||
    !selection.items.some(
      (i) =>
        i.kind === removal.kind &&
        i.id === removal.id &&
        i.hash === removal.hash,
    )
  )
    throw new Error('Limpeza pessoal não autenticada.');
  await verify(
    signer.signing,
    proof.signature,
    messageBody(account, proof.deviceId, 'personal-clean', proof),
  );
}
