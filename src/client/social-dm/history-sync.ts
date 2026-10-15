import { keys, object, uuid } from '../../shared/account/index.ts';
import { fingerprint } from '../../shared/devices/index.ts';
import { socialRevision } from '../../shared/social-dm/index.ts';

interface Snapshot {
  anchor: number;
  removals: number;
  directory: string;
  profile: string;
}
export interface DmHistoryCursor extends Snapshot {
  version: 3;
  after: number;
}
function snapshot(raw: unknown): Snapshot {
  const data = object(raw);
  keys(data, ['anchor', 'removals', 'directory', 'profile']);
  return {
    anchor: socialRevision(data['anchor']),
    removals: socialRevision(data['removals']),
    directory: fingerprint(data['directory']),
    profile: uuid(data['profile']),
  };
}
function startingCursor(raw: unknown, current: Snapshot): number {
  if (raw === null) return 0;
  const value = object(raw);
  if (
    value['version'] !== 3 ||
    value['removals'] !== current.removals ||
    value['directory'] !== current.directory ||
    value['profile'] !== current.profile
  )
    return 0;
  const after = socialRevision(value['after']);
  if (after > current.anchor) throw new Error('Diretório de DMs retrocedeu.');
  return after;
}

/** Only signed/authenticated metadata is reused; every open checks the current
 * snapshot and removals. Old cursors rescan once to include newly negotiated edits. */
export async function synchronizeDmHistory(options: {
  snapshot: () => Promise<unknown>;
  cursor: () => Promise<unknown>;
  save: (cursor: DmHistoryCursor) => Promise<void>;
  page: (
    snapshot: Snapshot,
    after: number,
  ) => Promise<{ next: number | null; unavailable: readonly string[] }>;
  guard: () => void;
}): Promise<void> {
  const current = snapshot(await options.snapshot());
  options.guard();
  const held = await options.cursor();
  let after = startingCursor(held, current),
    gap = false;
  for (let round = 0; after < current.anchor; round++) {
    if (round === 64)
      throw new Error('Continue sincronizando o histórico de DMs.');
    const page = await options.page(current, after);
    options.guard();
    gap ||= page.unavailable.length > 0;
    if (page.next === null) {
      after = current.anchor;
      break;
    }
    if (page.next <= after || page.next > current.anchor)
      throw new Error('Paginação de remoções divergente.');
    after = page.next;
  }
  const latest = snapshot(await options.snapshot());
  options.guard();
  if (JSON.stringify(latest) !== JSON.stringify(current))
    throw new Error(
      'Histórico de DMs mudou durante a leitura. Retome a sincronização.',
    );
  const next: DmHistoryCursor = { ...current, version: 3, after };
  if (!gap && !sameCursor(held, next)) await options.save(next);
  options.guard();
}
function sameCursor(raw: unknown, next: DmHistoryCursor): boolean {
  if (raw === null) return false;
  const held = object(raw);
  return Object.entries(next).every(([key, value]) => held[key] === value);
}
