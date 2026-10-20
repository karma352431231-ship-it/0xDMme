import { socialRevision } from '../../shared/social-dm/index.ts';
import { object, uuid } from '../../shared/account/index.ts';
import { exclusive } from '../device-storage/index.ts';
import type { VaultAuthority } from '../vault-authority/index.ts';
import {
  localGet,
  localPut,
  openLocal,
  sealLocal,
} from '../message-storage/index.ts';
import type { LocalCipher } from '../message-storage/index.ts';

function scope(a: VaultAuthority): string {
  return `${a.session.accountId}:${a.session.deviceId}`;
}
async function through(a: VaultAuthority, peer: string): Promise<number> {
  const row = await localGet<LocalCipher>(scope(a), `dm-read:${peer}`);
  return row
    ? socialRevision(JSON.parse(await openLocal(a, row)) as unknown)
    : 0;
}

/** A separate encrypted local cursor; packet, backup and sync formats stay intact. */
export async function markDmRead(input: {
  a: VaultAuthority;
  peer: string;
  sequence: number;
  guard: () => void;
}): Promise<void> {
  await exclusive(`dm-read:${scope(input.a)}:${input.peer}`, () =>
    saveRead(input),
  );
}
async function saveRead(
  input: Parameters<typeof markDmRead>[0],
): Promise<void> {
  const previous = await through(input.a, input.peer);
  input.guard();
  if (input.sequence <= previous) return;
  const row = await sealLocal(
    input.a,
    crypto.randomUUID(),
    JSON.stringify(input.sequence),
  );
  input.guard();
  await localPut(
    scope(input.a),
    `dm-read:${input.peer}`,
    row,
    row.bytes.length + 512,
  );
}
export function dmUnreadCount(
  raw: unknown,
  cursors: readonly { peer: string; through: number }[],
): number {
  if (!Array.isArray(raw) || raw.length > 16)
    throw new Error('Invalid DM page.');
  const known = new Map(cursors.map((row) => [row.peer, row.through]));
  let count = 0;
  for (const value of raw) {
    const row = object(value),
      peer = uuid(row['peer']),
      through = known.get(peer);
    if (
      through === undefined ||
      !Array.isArray(row['sequences']) ||
      row['sequences'].length > 100
    )
      throw new Error('Invalid DM page.');
    known.delete(peer);
    const sequences = new Set(
      (row['sequences'] as unknown[]).map(socialRevision),
    );
    count += [...sequences].filter((sequence) => sequence > through).length;
  }
  return Math.min(100, count);
}
export async function dmUnreadCursors(input: {
  a: VaultAuthority;
  peers: readonly string[];
  guard: () => void;
}): Promise<{ peer: string; through: number }[]> {
  const result = [];
  for (const peer of input.peers) {
    const sequence = await through(input.a, peer);
    input.guard();
    result.push({ peer, through: sequence });
  }
  return result;
}
