import { object, uuid } from '../../shared/account/index.ts';
import type { VaultEntry, VaultSync } from '../vault-sync/index.ts';

/**
 * Missed calls in the encrypted vault (plan §5.11, decision of 09/10/2026).
 * The server stores only opaque blocks. A `settings` record with its own entity
 * and label keeps older app versions, which filter by label, from reading it.
 */
const entity = '1bc0cb45-3af0-4298-b002-0d533d5bae79';
const label = 'Chamadas perdidas';
export const callLogLimit = 50;
export const callLogLifetime = 30 * 24 * 60 * 60 * 1000;

export interface MissedCall {
  id: string;
  peer: string;
  at: number;
}
/** Answered marks let every device drop a call another device answered. */
export interface CallLogValue {
  version: 1;
  missed: MissedCall[];
  answered: { id: string; at: number }[];
  clearedAt: number;
}

export function emptyCallLog(): CallLogValue {
  return { version: 1, missed: [], answered: [], clearedAt: 0 };
}

function timestamp(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    throw new Error('Registro de chamadas inválido.');
  return value;
}

export function parseCallLog(text: string): CallLogValue {
  const data = object(JSON.parse(text) as unknown);
  if (
    data['version'] !== 1 ||
    !Array.isArray(data['missed']) ||
    !Array.isArray(data['answered']) ||
    data['missed'].length > callLogLimit ||
    data['answered'].length > callLogLimit
  )
    throw new Error('Registro de chamadas inválido.');
  const missed: unknown[] = data['missed'];
  const answered: unknown[] = data['answered'];
  return {
    version: 1,
    missed: missed.map((value) => {
      const row = object(value);
      return {
        id: uuid(row['id']),
        peer: uuid(row['peer']),
        at: timestamp(row['at']),
      };
    }),
    answered: answered.map((value) => {
      const row = object(value);
      return { id: uuid(row['id']), at: timestamp(row['at']) };
    }),
    clearedAt: timestamp(data['clearedAt']),
  };
}

/** Union of device versions, then retention: 30 days, 50 newest of each kind, nothing before a clear. */
export function mergeCallLogs(
  values: readonly CallLogValue[],
  now: number,
): CallLogValue {
  const clearedAt = Math.max(0, ...values.map((value) => value.clearedAt));
  const oldest = Math.max(clearedAt, now - callLogLifetime);
  const keep = <T extends { id: string; at: number }>(rows: T[]): T[] =>
    [...new Map(rows.map((row) => [row.id, row])).values()]
      .filter((row) => row.at > oldest)
      .sort((a, b) => b.at - a.at)
      .slice(0, callLogLimit);
  return {
    version: 1,
    missed: keep(values.flatMap((value) => value.missed)),
    answered: keep(values.flatMap((value) => value.answered)),
    clearedAt,
  };
}

export function visibleMissedCalls(value: CallLogValue): MissedCall[] {
  const answered = new Set(value.answered.map((row) => row.id));
  return value.missed.filter((call) => !answered.has(call.id));
}

export class CallLog {
  private readonly sync: VaultSync;
  // Writes that failed (offline, sync incomplete) stay visible and are retried.
  private pending = emptyCallLog();
  constructor(sync: VaultSync) {
    this.sync = sync;
  }
  private entries(): VaultEntry[] {
    return [...this.sync.currentHeads().values()]
      .flat()
      .filter(
        (entry) =>
          entry.change.entity === entity &&
          entry.change.kind === 'settings' &&
          entry.change.label === label &&
          !this.sync.isRemoved(entry.commit.id),
      );
  }
  private async stored(): Promise<CallLogValue[]> {
    return Promise.all(
      this.entries().map(async (entry) =>
        parseCallLog(await this.sync.open(entry.commit.id)),
      ),
    );
  }
  async missed(): Promise<MissedCall[]> {
    return visibleMissedCalls(
      mergeCallLogs([...(await this.stored()), this.pending], Date.now()),
    );
  }
  /** Saves the merged log with every current version as parent, resolving conflicts. */
  private async write(change: Partial<CallLogValue>): Promise<void> {
    const now = Date.now();
    this.pending = mergeCallLogs(
      [this.pending, { ...emptyCallLog(), ...change }],
      now,
    );
    const parents = this.entries().map((entry) => entry.commit.id);
    const value = mergeCallLogs([...(await this.stored()), this.pending], now);
    await this.sync.save({
      change: { version: 1, entity, kind: 'settings', parents, label },
      value: JSON.stringify(value),
    });
    this.pending = emptyCallLog();
  }
  recordMissed(call: MissedCall): Promise<void> {
    return this.write({ missed: [call] });
  }
  recordAnswered(id: string): Promise<void> {
    return this.write({ answered: [{ id, at: Date.now() }] });
  }
  clear(): Promise<void> {
    return this.write({ clearedAt: Date.now() });
  }
  reset(): void {
    this.pending = emptyCallLog();
  }
}
