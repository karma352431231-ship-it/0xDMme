import { object, uuid } from '../../shared/account/index.ts';
import {
  canonical,
  digest,
  eventHash,
  fingerprint,
  verifyHistory,
} from '../../shared/devices/index.ts';
import type { DirectoryEvent } from '../../shared/devices/index.ts';
import { integer } from '../../shared/vault/index.ts';
import { addressBookEntry } from '../../shared/contacts/index.ts';
import type { VaultSync, VaultEntry } from '../vault-sync/index.ts';
import type { VaultWorkOptions } from '../vault-authority/index.ts';
export interface PeerPin {
  fingerprint: string;
  directory: string;
  revision: number;
}
export async function verifiedPeer(c: {
  events: unknown[];
  account: string;
  expected: string | null;
  pin: PeerPin | null;
  current: boolean;
}): Promise<DirectoryEvent[]> {
  const last = await verifyHistory(c.events, c.account);
  if (!last) throw new Error('Directory missing.');
  if (c.expected !== null && (await eventHash(last)) !== c.expected)
    throw new Error('Directory does not match.');
  const checked = c.events as DirectoryEvent[],
    pin = await pinFor(checked);
  if (c.pin)
    await checkPeerPin({
      known: c.pin,
      pin,
      history: checked,
      current: c.current,
    });
  return checked;
}
async function checkPeerPin(c: {
  known: PeerPin;
  pin: PeerPin;
  history: DirectoryEvent[];
  current: boolean;
}): Promise<void> {
  if (c.known.fingerprint !== c.pin.fingerprint)
    throw new Error(
      "The contact's identity changed. Check with them before continuing.",
    );
  if (c.current && c.pin.revision < c.known.revision)
    throw new Error('Old contact directory.');
  const pinned = c.history[c.known.revision - 1];
  if (pinned && (await eventHash(pinned)) !== c.known.directory)
    throw new Error('Directory differs from the pinned identity.');
}
export async function pinFor(history: DirectoryEvent[]): Promise<PeerPin> {
  const first = history[0],
    last = history.at(-1);
  if (!first || !last) throw new Error('Directory missing.');
  return {
    fingerprint: await digest(
      canonical([first.root.signing, first.root.wrapping]),
    ),
    directory: await eventHash(last),
    revision: last.revision,
  };
}

type IdentitySync = Pick<
  VaultSync,
  'refresh' | 'complete' | 'currentHeads' | 'openMany' | 'save' | 'isRemoved'
>;
/** All conversation types share the existing encrypted contact identity records. */
export class PeerIdentity {
  private loaded = new Set<string>();
  private readonly sync: IdentitySync;
  private readonly pins = new Map<string, PeerPin>();
  private readonly pending = new Map<string, PeerPin>();
  private generation = 0;
  constructor(sync: IdentitySync) {
    this.sync = sync;
  }
  clear(): void {
    this.generation++;
    this.pins.clear();
    this.pending.clear();
    this.loaded.clear();
  }
  private guard(generation: number): void {
    if (generation !== this.generation)
      throw new Error('Session changed during identity verification.');
  }
  get(account: string): PeerPin | null {
    return this.pins.get(account) ?? null;
  }
  async load(options: VaultWorkOptions = {}): Promise<void> {
    const generation = this.generation;
    const deadline = Date.now() + 60_000;
    do {
      if (Date.now() > deadline)
        throw new Error(
          'Could not complete identity synchronization. Try again.',
        );
      await this.sync.refresh(options);
      this.guard(generation);
    } while (!this.sync.complete);
    await this.loadCurrent(options);
  }
  /** Hydrate a completely verified vault state, including our just-confirmed pin. */
  async loadCurrent(options: VaultWorkOptions = {}): Promise<void> {
    const generation = this.generation;
    if (!this.sync.complete)
      throw new Error('Identidades ainda não sincronizadas.');
    const entries = [...this.sync.currentHeads().values()].flat();
    const pending = entries.filter(
      (entry) =>
        !this.loaded.has(entry.commit.id) &&
        !this.sync.isRemoved(entry.commit.id) &&
        (entry.change.kind === 'address-book' ||
          (entry.change.kind === 'contact' &&
            entry.change.label === 'Identidade para mensagens')),
    );
    for (let offset = 0; offset < pending.length; offset += 16) {
      const page = pending.slice(offset, offset + 16);
      const values = await this.sync.openMany(
        page.map((entry) => entry.commit.id),
        options,
      );
      this.guard(generation);
      for (const [index, entry] of page.entries())
        this.loadEntry(entry, values[index]!, generation);
    }
    this.guard(generation);
    this.loaded = new Set(entries.map((entry) => entry.commit.id));
  }
  private loadEntry(
    entry: VaultEntry,
    content: string,
    generation: number,
  ): void {
    if (this.sync.isRemoved(entry.commit.id)) return;
    if (entry.change.kind === 'address-book') {
      const stored = addressBookEntry(JSON.parse(content) as unknown);
      this.guard(generation);
      if (stored.accountId && stored.identity && stored.directory)
        this.accept(stored.accountId, {
          fingerprint: stored.identity,
          directory: stored.directory,
          revision: stored.identityRevision,
        });
      return;
    }
    if (
      entry.change.kind !== 'contact' ||
      entry.change.label !== 'Identidade para mensagens'
    )
      return;
    const value = object(JSON.parse(content) as unknown),
      pin = object(value['pin']);
    this.guard(generation);
    this.accept(uuid(value['accountId']), {
      fingerprint: fingerprint(pin['fingerprint']),
      directory: fingerprint(pin['directory']),
      revision: integer(pin['revision'], 128),
    });
  }
  private accept(account: string, next: PeerPin): void {
    const old = this.pins.get(account);
    if (old && old.fingerprint !== next.fingerprint)
      throw new Error('Pinned identities conflict.');
    if (
      old &&
      old.revision === next.revision &&
      old.directory !== next.directory
    )
      throw new Error('Pinned directories do not match.');
    if (!old || old.revision < next.revision) this.pins.set(account, next);
  }
  async remember(account: string, history: DirectoryEvent[]): Promise<void> {
    const generation = this.generation;
    const next = await pinFor(history),
      old = this.pins.get(account);
    this.guard(generation);
    this.accept(account, next);
    if (!old || next.revision > old.revision) this.pending.set(account, next);
  }
  async verify(input: {
    account: string;
    events: unknown[];
    expected: string | null;
    current: boolean;
  }): Promise<DirectoryEvent[]> {
    const generation = this.generation;
    const events = await verifiedPeer({
      ...input,
      pin: this.get(input.account),
    });
    this.guard(generation);
    await this.remember(input.account, events);
    return events;
  }
  async save(
    continueWork?: () => void,
    options: VaultWorkOptions = {},
  ): Promise<void> {
    const generation = this.generation;
    for (const [accountId, pin] of this.pending) {
      continueWork?.();
      this.guard(generation);
      const previous = [...this.sync.currentHeads().values()]
        .flat()
        .filter(
          (e) =>
            e.change.kind === 'contact' &&
            e.change.entity === accountId &&
            e.change.label === 'Identidade para mensagens',
        );
      await this.sync.save(
        {
          change: {
            version: 1,
            entity: accountId,
            kind: 'contact',
            parents: previous.map((e) => e.commit.id),
            label: 'Identidade para mensagens',
          },
          value: JSON.stringify({ accountId, pin }),
        },
        options,
      );
      this.guard(generation);
      this.pending.delete(accountId);
    }
  }
}

interface DirectoryReadInput {
  accounts: string[];
  identities: PeerIdentity;
  load: (requests: { accountId: string; after: number }[]) => Promise<unknown>;
}
interface DirectoryParts {
  events: unknown[];
  head: string | null;
  revision: number;
  recovery: unknown;
}
interface ReadDirectory {
  events: DirectoryEvent[];
  recovery: unknown;
}
/** Bounded batches preserve all authorized devices without one query per participant. */
export async function readDirectories(
  input: DirectoryReadInput,
): Promise<Map<string, ReadDirectory>> {
  const result = new Map<string, ReadDirectory>();
  for (let offset = 0; offset < input.accounts.length; offset += 16) {
    const batch = await readDirectoryBatch({
      ...input,
      accounts: input.accounts.slice(offset, offset + 16),
    });
    for (const [account, directory] of batch) result.set(account, directory);
  }
  return result;
}
async function readDirectoryBatch(
  input: DirectoryReadInput,
): Promise<Map<string, ReadDirectory>> {
  const result = new Map<string, ReadDirectory>(),
    histories = new Map<string, DirectoryParts>(
      input.accounts.map((account) => [
        account,
        { events: [], head: null, revision: 0, recovery: null },
      ]),
    );
  for (let page = 0; page < 16; page++) {
    const requests = [...histories]
      .filter(([account]) => !result.has(account))
      .map(([accountId, h]) => ({ accountId, after: h.events.length }));
    if (!requests.length) break;
    const data = directoryBatchResponse(
      await input.load(requests),
      requests.length,
    );
    const seen = new Set<string>();
    for (const raw of data.directories) {
      const row = object(raw),
        account = uuid(row['accountId']),
        history = histories.get(account);
      if (!history || result.has(account) || seen.has(account))
        throw new Error('Directory belongs to another page or is duplicated.');
      seen.add(account);
      appendDirectory(history, row);
      history.recovery =
        data.recovery.find((r) => object(r)['accountId'] === account) ??
        history.recovery;
      if (history.events.length === history.revision)
        result.set(account, {
          events: await input.identities.verify({
            account,
            events: history.events,
            expected: history.head,
            current: true,
          }),
          recovery: history.recovery,
        });
    }
  }
  if (input.accounts.some((account) => !result.has(account)))
    throw new Error('Directory omitted.');
  return result;
}
function directoryBatchResponse(
  input: unknown,
  count: number,
): { directories: unknown[]; recovery: unknown[] } {
  const data = object(input),
    directories = data['directories'],
    recovery = data['recovery'];
  if (
    !Array.isArray(directories) ||
    directories.length !== count ||
    !Array.isArray(recovery) ||
    recovery.length > count
  )
    throw new Error('Recipient directories incomplete.');
  return { directories, recovery };
}
function appendDirectory(
  history: DirectoryParts,
  row: Record<string, unknown>,
): void {
  const head = fingerprint(row['head']),
    revision = integer(row['revision'], 128),
    events = row['events'];
  if (!Array.isArray(events) || !events.length || events.length > 8)
    throw new Error('Invalid directory page.');
  if (history.head && (head !== history.head || revision !== history.revision))
    throw new Error('Devices changed while reading. Try again.');
  history.head = head;
  history.revision = revision;
  const values: unknown[] = events;
  history.events.push(...values);
  if (history.events.length > revision)
    throw new Error('Directory exceeds the limit.');
}

export type Api = (
  operation: string,
  payload: Record<string, unknown>,
) => Promise<unknown>;
export async function peerHistory(
  api: Api,
  account: string,
  through: number | null,
  pin: PeerPin | null,
): Promise<DirectoryEvent[]> {
  const events: unknown[] = [];
  let expected: string | null = null;
  for (let page = 0; page < 16; page++) {
    const result = await api(through === null ? 'peer-directory' : 'history', {
      accountId: account,
      after: events.length,
      ...(through === null ? {} : { through }),
    });
    const raw = through === null ? object(result)['events'] : result;
    assertHistoryPage(raw);
    events.push(...raw);
    const revision = through ?? integer(object(result)['revision'], 128);
    if (through === null) expected = fingerprint(object(result)['head']);
    if (events.length !== revision) continue;
    return verifiedPeer({
      events,
      account,
      expected,
      pin,
      current: through === null,
    });
  }
  throw new Error('Directory incomplete.');
}
function assertHistoryPage(raw: unknown): asserts raw is unknown[] {
  if (!Array.isArray(raw) || raw.length > 8 || !raw.length)
    throw new Error('Directory omitted or invalid.');
}
