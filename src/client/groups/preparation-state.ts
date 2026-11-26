import { keys, object, uuid } from '../../shared/account/index.ts';
import { canonical } from '../../shared/devices/index.ts';
import { integer } from '../../shared/vault/index.ts';
import type { VaultAuthority } from '../vault-authority/index.ts';
import { GroupCache } from './cache.ts';

/** How much of a group this device's local copy already holds, so background
 * preparation reads only what is missing instead of the whole history on
 * every start. Private chats and `@` DMs keep an equivalent cursor.
 *
 * The record is sealed next to the local copy (same store, scope and
 * lifetime) and belongs to this account's own participation period, so
 * another member joining or leaving keeps it while a reentry starts over. It
 * holds sequences, one revision and message ids, never content. It never
 * replaces a verification: every read still checks governance, hashes,
 * signatures and the final cut confirmation. A missing, corrupt or foreign
 * record is a safe miss that prepares the whole history again. */
export interface Coverage {
  /** Own `joined` epoch of the participation period. */
  joined: number;
  /** Highest sequence of the last cut whose new packets were all read, or
   * null for a server without finite cuts. */
  high: number | null;
  /** That cut's message revision, where the change journal continues. */
  revision: number;
  /** The next older page of the first full pass; null once it reached the
   * oldest readable message. */
  older: number | null;
  /** Packets at or below `high` still to be read: new ones a full index pass
   * found after a change journal gap. */
  owed: string[];
  /** Read packets whose receipt waits for their media. The change journal
   * reports when media becomes available; after a gap they are owed again. */
  held: string[];
}

/** What one confirmed read did, reported by the reader. */
export interface ConfirmedRead {
  joined: number;
  snapshot: { revision: number; anchor?: number };
  /** The change journal start of this read; null for a full index pass. */
  from: number | null;
  /** Full index pass: ids above the coverage's `high`, null when not
   * collected or too many. */
  newer: readonly string[] | null;
  /** A latest window's lowest sequence, where a first full pass starts. */
  start?: number | null;
  /** Older pages read at this cut, from the coverage's `older` cursor. */
  older?: { from: number; to: number | null };
  /** Packets read and, unless own, acknowledged. */
  settled: readonly string[];
  /** Packets read whose receipt still waits for their media. */
  held: readonly string[];
}

/** The packets one confirmed cut read, for `ConfirmedRead`. Own packets and
 * packets without unavailable media are settled; the last read wins. */
export class ReadObservation {
  readonly settled = new Set<string>();
  readonly held = new Set<string>();
  record(
    views: readonly {
      id: string;
      own: boolean;
      unavailableMedia: readonly string[];
    }[],
  ): void {
    for (const view of views) {
      const waiting = !view.own && view.unavailableMedia.length > 0;
      (waiting ? this.held : this.settled).add(view.id);
      (waiting ? this.settled : this.held).delete(view.id);
    }
  }
}

const name = 'preparation';
/** Index pass ids kept for one gap; a larger gap prepares the whole history. */
export const owedLimit = 4096;
const heldLimit = 64;

/** The device's coverage owner: loads each group's record once per session,
 * advances it after confirmed reads and seals every change. */
export class GroupCoverage {
  private readonly records = new Map<string, Coverage | null>();
  /** Groups whose next read must check the full index again. */
  private readonly unverified = new Set<string>();
  clear(): void {
    this.records.clear();
    this.unverified.clear();
  }
  /** After a failed or denied read the change journal is not trusted until a
   * full index pass succeeds; what earlier reads covered stays valid. */
  reverify(group: string): void {
    this.unverified.add(group);
  }
  /** Where the change journal continues, unless a full pass is required. */
  journal(group: string, joined: number): number | null {
    if (this.unverified.has(group)) return null;
    return this.current(group, joined)?.revision ?? null;
  }
  /** The coverage of this participation period, after `load`. */
  current(group: string, joined: number): Coverage | null {
    const record = this.records.get(group) ?? null;
    return record?.joined === joined ? record : null;
  }
  /** True while the first full pass or owed packets remain. */
  due(group: string, joined: number): boolean {
    const record = this.current(group, joined);
    return !record || record.older !== null || record.owed.length > 0;
  }
  async load(
    authority: VaultAuthority,
    group: string,
    joined: number,
  ): Promise<Coverage | null> {
    if (!this.records.has(group))
      this.records.set(group, await readCoverage(authority, group));
    return this.current(group, joined);
  }
  /** False when the local store refused the record: this session keeps it
   * and the next change tries again, so only a later start repeats work. */
  async confirmed(
    authority: VaultAuthority,
    group: string,
    read: ConfirmedRead,
  ): Promise<boolean> {
    const previous = this.records.get(group) ?? null,
      next = advanceCoverage(previous, read);
    this.records.set(group, next);
    if (read.from === null) this.unverified.delete(group);
    if (next === null || canonical(next) === canonical(previous)) return true;
    try {
      await new GroupCache(authority, group).put(name, {
        version: 1,
        ...next,
      });
      return true;
    } catch {
      // Full local storage or an unavailable store: the record is optional.
      return false;
    }
  }
}

/** The coverage after a confirmed read: extended when the read continued the
 * recorded range, a new first full pass after a latest window read that could
 * not, otherwise unchanged. */
export function advanceCoverage(
  current: Coverage | null,
  read: ConfirmedRead,
): Coverage | null {
  const own = current?.joined === read.joined ? current : null;
  const next = (own && extended(own, read)) ?? started(read) ?? own;
  return next && settled(next, read);
}

function extended(coverage: Coverage, read: ConfirmedRead): Coverage | null {
  const high = read.snapshot.anchor ?? null,
    revision = read.snapshot.revision,
    older =
      read.older && read.older.from === coverage.older
        ? read.older.to
        : coverage.older;
  if (read.from !== null)
    return read.from <= coverage.revision
      ? { ...coverage, high, revision, older }
      : null;
  if (coverage.high === null || high === null || read.newer === null)
    return null;
  const owed = [
    ...new Set([...coverage.owed, ...read.newer, ...coverage.held]),
  ];
  if (owed.length > owedLimit) return null;
  return { ...coverage, high, revision, older, owed, held: [] };
}

function started(read: ConfirmedRead): Coverage | null {
  if (read.start === undefined) return null;
  return {
    joined: read.joined,
    high: read.snapshot.anchor ?? null,
    revision: read.snapshot.revision,
    older: read.start,
    owed: [],
    held: [],
  };
}

function settled(coverage: Coverage, read: ConfirmedRead): Coverage {
  const done = new Set(read.settled),
    waiting = new Set(read.held);
  return {
    ...coverage,
    owed: coverage.owed.filter((id) => !done.has(id) && !waiting.has(id)),
    held: [...new Set([...coverage.held, ...read.held])]
      .filter((id) => !done.has(id))
      .slice(-heldLimit),
  };
}

async function readCoverage(
  authority: VaultAuthority,
  group: string,
): Promise<Coverage | null> {
  try {
    const raw = await new GroupCache(authority, group).get(name);
    return raw === null ? null : decodeCoverage(raw);
  } catch {
    // Corrupt, foreign or unreadable records are safe misses.
    return null;
  }
}

function decodeCoverage(raw: unknown): Coverage {
  const value = object(raw);
  keys(value, [
    'version',
    'joined',
    'high',
    'revision',
    'older',
    'owed',
    'held',
  ]);
  if (value['version'] !== 1) throw new Error('Unknown group coverage.');
  return {
    joined: integer(value['joined'], Number.MAX_SAFE_INTEGER),
    high: optionalSequence(value['high']),
    revision: integer(value['revision'], Number.MAX_SAFE_INTEGER),
    older: optionalSequence(value['older']),
    owed: ids(value['owed'], owedLimit),
    held: ids(value['held'], heldLimit),
  };
}

function optionalSequence(value: unknown): number | null {
  return value === null ? null : integer(value, Number.MAX_SAFE_INTEGER);
}

function ids(value: unknown, limit: number): string[] {
  if (!Array.isArray(value) || value.length > limit)
    throw new Error('Invalid group coverage.');
  const result = value.map(uuid);
  if (new Set(result).size !== result.length)
    throw new Error('Invalid group coverage.');
  return result;
}
