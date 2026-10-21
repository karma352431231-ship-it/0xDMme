import {
  AccountError,
  keys,
  object,
  uuid,
} from '../../shared/account/index.ts';
import { fingerprint } from '../../shared/devices/index.ts';
import { socialRevision } from '../../shared/social-dm/index.ts';
import {
  expectedInterruption,
  WorkInterruption,
} from '../synchronization-work/index.ts';

export interface DmHistorySnapshot {
  anchor: number;
  removals: number;
  directory: string;
  profile: string;
}
export interface DmHistoryCursor extends DmHistorySnapshot {
  version: 3;
  after: number;
}
function snapshot(raw: unknown): DmHistorySnapshot {
  const data = object(raw);
  keys(data, ['anchor', 'removals', 'directory', 'profile']);
  return {
    anchor: socialRevision(data['anchor']),
    removals: socialRevision(data['removals']),
    directory: fingerprint(data['directory']),
    profile: uuid(data['profile']),
  };
}
function sameAuthority(a: DmHistorySnapshot, b: DmHistorySnapshot): boolean {
  return (
    a.removals === b.removals &&
    a.directory === b.directory &&
    a.profile === b.profile
  );
}
/** Later arrivals belong to the next finite batch. Deletions and authority changes
 * still invalidate this batch; the server checks the same fields on every page. */
export function confirmDmHistory(
  expected: DmHistorySnapshot,
  raw: unknown,
): void {
  const current = snapshot(raw);
  if (!sameAuthority(expected, current) || current.anchor < expected.anchor)
    throw new AccountError(
      409,
      'DM history changed while reading. Resume synchronization.',
    );
}
function startingCursor(raw: unknown, current: DmHistorySnapshot): number {
  if (raw === null) return 0;
  const value = object(raw);
  if (
    value['version'] !== 3 ||
    !sameAuthority(
      snapshot({
        anchor: value['anchor'],
        removals: value['removals'],
        directory: value['directory'],
        profile: value['profile'],
      }),
      current,
    )
  )
    return 0;
  const after = socialRevision(value['after']);
  if (after > current.anchor) throw new Error('DM directory rolled back.');
  return after;
}
interface HistoryPorts {
  snapshot: () => Promise<unknown>;
  cursor: () => Promise<unknown>;
  save: (cursor: DmHistoryCursor) => Promise<void>;
  page: (
    snapshot: DmHistorySnapshot,
    after: number,
  ) => Promise<{ next: number | null; unavailable: readonly string[] }>;
  guard: () => void;
}
interface Progress {
  snapshot: DmHistorySnapshot;
  after: number;
  held: unknown;
  pending: number | null;
}
/** One account owner, one confirmed page per turn, one finite target across
 * navigation and concurrent wakeups. Cursor writes occur after confirmation. */
export class DmHistorySynchronization {
  private progress: Progress | null = null;
  private active: Promise<DmHistorySnapshot> | null = null;
  private generation = 0;
  reset(): void {
    this.generation++;
    this.progress = null;
    this.active = null;
  }
  run(ports: HistoryPorts): Promise<DmHistorySnapshot> {
    if (this.active) return this.active;
    const generation = this.generation;
    const guard = () => {
      ports.guard();
      if (generation !== this.generation) throw new WorkInterruption('session');
    };
    const work = this.read({ ...ports, guard })
      .catch((error: unknown) => {
        if (generation === this.generation && !expectedInterruption(error))
          this.progress = null;
        throw error;
      })
      .finally(() => {
        if (this.active === work) this.active = null;
      });
    this.active = work;
    return work;
  }
  private async read(ports: HistoryPorts): Promise<DmHistorySnapshot> {
    ports.guard();
    const progress = this.progress ?? (await this.target(ports));
    if (
      progress.pending === null &&
      progress.after < progress.snapshot.anchor
    ) {
      const page = await ports.page(progress.snapshot, progress.after);
      ports.guard();
      const after = page.next === null ? progress.snapshot.anchor : page.next;
      if (after <= progress.after || after > progress.snapshot.anchor)
        throw new Error('Removal pagination does not match.');
      if (page.unavailable.length) throw new Error('DM unavailable.');
      // Every page is authorized against this removal/directory context by the
      // server. The sealed prefix remains bound to it after restart. It is not a
      // presentation permit: final confirmation is still mandatory below.
      if (after < progress.snapshot.anchor) {
        await this.save(ports, progress, after);
        throw new WorkInterruption('continuation');
      }
      progress.pending = after;
    }
    confirmDmHistory(progress.snapshot, await ports.snapshot());
    ports.guard();
    await this.save(ports, progress, progress.pending ?? progress.after);
    this.progress = null;
    return progress.snapshot;
  }
  private async target(ports: HistoryPorts): Promise<Progress> {
    const current = snapshot(await ports.snapshot());
    ports.guard();
    const held = await ports.cursor();
    ports.guard();
    const progress = {
      snapshot: current,
      after: startingCursor(held, current),
      held,
      pending: null,
    };
    this.progress = progress;
    return progress;
  }
  private async save(
    ports: HistoryPorts,
    progress: Progress,
    after: number,
  ): Promise<void> {
    const next: DmHistoryCursor = { ...progress.snapshot, version: 3, after };
    if (!sameCursor(progress.held, next)) await ports.save(next);
    ports.guard();
    progress.held = next;
    progress.after = after;
  }
}
function sameCursor(raw: unknown, next: DmHistoryCursor): boolean {
  if (raw === null) return false;
  const held = object(raw);
  return Object.entries(next).every(([key, value]) => held[key] === value);
}
