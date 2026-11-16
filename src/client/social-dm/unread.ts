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
  const known = new Map(cursors.map((row) => [row.peer, row.through]));
  let count = 0;
  for (const [peer, sequences] of unreadSequences(raw, new Set(known.keys())))
    count += [...sequences].filter(
      (sequence) => sequence > known.get(peer)!,
    ).length;
  return Math.min(100, count);
}

export function latestDmNotification(raw: unknown, peer: string): number {
  return Math.max(
    0,
    ...(unreadSequences(raw, new Set([peer])).get(peer) ?? []),
  );
}

function unreadSequences(
  raw: unknown,
  allowed: Set<string>,
): Map<string, Set<number>> {
  if (!Array.isArray(raw) || raw.length > 16)
    throw new Error('Invalid DM page.');
  const result = new Map<string, Set<number>>();
  for (const value of raw) {
    const row = object(value);
    const peer = uuid(row['peer']);
    const values = row['sequences'];
    if (!allowed.delete(peer) || !Array.isArray(values) || values.length > 100)
      throw new Error('Invalid DM page.');
    result.set(peer, new Set((values as unknown[]).map(socialRevision)));
  }
  return result;
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
