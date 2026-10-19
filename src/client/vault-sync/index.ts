import { RemovalIndex } from '../personal-removals/index.ts';
import { encode, object } from '../../shared/account/index.ts';
import type { AccountSession } from '../../shared/account/index.ts';
import {
  bytesHash,
  commitHash,
  integer,
  pageSize,
  verifyCommit,
  verifySuccessor,
} from '../../shared/vault/index.ts';
import type { VaultChange, VaultCommit } from '../../shared/vault/index.ts';
import type {
  VaultAccess,
  VaultAuthority,
  VaultLocator,
  VaultWorkOptions,
} from '../vault-authority/index.ts';
import {
  openBlock,
  openManifest,
  sealBlock,
  sealCommit,
} from '../vault-crypto/index.ts';
import {
  cachedPage,
  checkpoint,
  commitPage,
  draft,
  saveDraft,
  localLocator,
} from '../vault-storage/index.ts';
import type { VaultCheckpoint, VaultDraft } from '../vault-storage/index.ts';
import { readPage } from './protocol.ts';
import { QueuedVaultRefresh } from './queued-refresh.ts';
import type { VaultPage } from './protocol.ts';
import { vaultApi as api } from './api.ts';
import { assertVaultObjectsAvailable, openVaultObjects } from './objects.ts';
export { readPage } from './protocol.ts';
export interface VaultEntry {
  commit: VaultCommit;
  change: VaultChange;
}
function sequenceOf(commit: VaultCommit | null): number {
  return commit?.sequence ?? 0;
}
function hashOf(commit: VaultCommit | null): Promise<string | null> {
  return commit ? commitHash(commit) : Promise.resolve(null);
}
function validatePageHead(page: VaultPage, next: VaultCheckpoint): void {
  if (
    page.sequence < next.sequence ||
    (!page.commits.length && page.sequence > next.sequence)
  )
    throw new Error('Vault page omitted.');
  if (page.sequence === next.sequence && page.head !== next.head)
    throw new Error('Remote vault differs from checkpoint.');
}
export class VaultSync {
  session: AccountSession | null = null;
  entries = new Map<string, VaultEntry>();
  pending: VaultDraft | null = null;
  state: VaultCheckpoint = { sequence: 0, head: null, used: 0 };
  complete = false;
  remotePending: VaultCommit[] = [];
  private readonly access: VaultAccess;
  private generation = 0;
  private locator: VaultLocator | null = null;
  private localOnly = false;
  private readonly removals = new RemovalIndex();
  private readonly refreshes = new QueuedVaultRefresh();
  get removalCursor(): number {
    return this.removals.cursor;
  }
  isRemoved(id: string): boolean {
    return this.removals.has('vault', id);
  }
  constructor(access: VaultAccess) {
    this.access = access;
  }
  setSession(session: AccountSession | null): void {
    if (
      session?.accountId !== this.session?.accountId ||
      session?.deviceId !== this.session?.deviceId ||
      session?.csrf !== this.session?.csrf
    ) {
      this.clear();
      this.locator = null;
      this.localOnly = false;
    }
    this.session = session;
  }
  clear(): void {
    this.refreshes.barrier();
    this.generation++;
    this.entries.clear();
    this.removals.reset();
    this.pending = null;
    this.complete = false;
    this.remotePending = [];
    this.state = { sequence: 0, head: null, used: 0 };
  }
  private async run<T>(
    work: (authority: VaultAuthority) => Promise<T>,
    request: { started?: () => void; options?: VaultWorkOptions } = {},
  ): Promise<T> {
    if (!request.started) this.refreshes.barrier();
    const session = this.localOnly ? null : this.session;
    const generation = this.generation;
    const locator = session ?? this.locator;
    if (!locator)
      throw new Error(
        'Connect the original wallet or open an authorized local copy.',
      );
    const operation = async (authority: VaultAuthority) => {
      if (
        authority.session.accountId !== locator.accountId ||
        authority.session.deviceId !== locator.deviceId ||
        generation !== this.generation
      )
        throw new Error('Session changed.');
      request.started?.();
      let result: T;
      try {
        result = await work(authority);
      } finally {
        if (generation !== this.generation) this.clear();
      }
      if (generation !== this.generation)
        throw new Error('Session changed during synchronization.');
      return result;
    };
    return session
      ? this.access.withVault(!navigator.onLine, operation, request.options)
      : this.access.withLocalVault(locator, operation);
  }
  async openLocal(): Promise<void> {
    this.refreshes.barrier();
    this.locator = await localLocator();
    this.localOnly = true;
    await this.run((authority) => this.loadLocal(authority));
  }
  get localOpened(): boolean {
    return this.locator !== null;
  }
  async refresh(options: VaultWorkOptions = {}): Promise<void> {
    if (this.session) this.localOnly = false;
    await this.refreshes.read(
      !navigator.onLine,
      (started) =>
        this.run(
          async (authority) => {
            await this.loadLocal(authority);
            if (!authority.offline) await this.pull(authority);
          },
          { started, options },
        ),
      options.priority,
    );
  }
  private async readEntry(
    authority: VaultAuthority,
    input: unknown,
  ): Promise<VaultEntry> {
    const raw = object(input);
    const event = authority.events[integer(raw['authorityRevision'], 128) - 1];
    if (!event) throw new Error('Manifest references an unknown authority.');
    const commit = await verifyCommit(input, event);
    if (commit.accountId !== authority.session.accountId)
      throw new Error('Manifest belongs to another account.');
    const change = await openManifest(
      await authority.key(commit.epoch),
      commit,
    );
    for (const id of change.parents) {
      const parent = this.entries.get(id);
      if (
        !parent ||
        parent.change.entity !== change.entity ||
        parent.change.kind !== change.kind
      )
        throw new Error('Invalid private version relationship.');
    }
    return { commit, change };
  }
  private async loadLocal(authority: VaultAuthority): Promise<void> {
    await this.removals.load(authority, () => {
      if (
        this.session &&
        this.session.accountId !== authority.session.accountId
      )
        throw new Error('Session changed.');
    });
    this.state = await checkpoint(authority.session.accountId);
    this.pending = await draft(authority.session.accountId);
    let previous = this.lastCommit();
    // Work is paged and bounded per interaction, including after browser restart.
    for (let page = 0; page < 8; page++) {
      const commits = await cachedPage(
        authority.session.accountId,
        sequenceOf(previous),
      );
      for (const raw of commits) {
        const entry = await this.readEntry(authority, raw);
        await verifySuccessor(previous, entry.commit);
        this.entries.set(entry.commit.id, entry);
        previous = entry.commit;
      }
      if (commits.length < pageSize) break;
    }
    this.complete = sequenceOf(previous) === this.state.sequence;
    await this.checkLocalHead(previous);
  }
  private async checkLocalHead(previous: VaultCommit | null): Promise<void> {
    if (this.complete && (await hashOf(previous)) !== this.state.head)
      throw new Error('Local checkpoint corrupted.');
  }
  private async pull(authority: VaultAuthority): Promise<void> {
    if (!this.complete) return;
    for (let page = 0; page < 8; page++) {
      await this.acceptPage(
        authority,
        readPage(
          await api(authority, 'read', {
            after: this.state.sequence,
            ...(this.pending ? { pendingId: this.pending.commit.id } : {}),
          }),
        ),
      );
      await this.reconcileDraft(authority);
      if (this.complete) return;
    }
  }
  private async acceptPage(
    authority: VaultAuthority,
    page: VaultPage,
  ): Promise<void> {
    let previous = this.lastCommit();
    const staged: VaultEntry[] = [];
    try {
      for (const raw of page.commits) {
        const entry = await this.readEntry(authority, raw);
        await verifySuccessor(previous, entry.commit);
        if (this.entries.has(entry.commit.id))
          throw new Error('Duplicate operation in the chain.');
        this.entries.set(entry.commit.id, entry);
        staged.push(entry);
        previous = entry.commit;
      }
      const next = {
        sequence: sequenceOf(previous),
        head: await hashOf(previous),
        used: page.used,
      };
      validatePageHead(page, next);
      await commitPage(
        authority.session.accountId,
        this.state,
        next,
        staged.map((e) => e.commit),
      );
      this.state = next;
      this.remotePending = page.pending;
      this.complete = page.sequence === next.sequence;
    } catch (error: unknown) {
      for (const entry of staged) this.entries.delete(entry.commit.id);
      throw error;
    }
  }
  private async reconcileDraft(authority: VaultAuthority): Promise<void> {
    if (this.pending && this.entries.has(this.pending.commit.id)) {
      const confirmed = this.entries.get(this.pending.commit.id);
      if (
        !confirmed ||
        (await commitHash(confirmed.commit)) !==
          (await commitHash(this.pending.commit))
      )
        throw new Error(
          'Identifier confirmed with different content. Draft preserved.',
        );
      await saveDraft(authority.session.accountId, null);
      this.pending = null;
    }
  }
  latest(): VaultEntry | undefined {
    return [...this.entries.values()].at(-1);
  }
  private lastCommit(): VaultCommit | null {
    return this.latest()?.commit ?? null;
  }
  heads(entity: string): VaultEntry[] {
    const versions = [...this.entries.values()].filter(
      (e) => e.change.entity === entity,
    );
    const superseded = new Set(versions.flatMap((e) => e.change.parents));
    return versions.filter((e) => !superseded.has(e.commit.id));
  }
  currentHeads(): Map<string, VaultEntry[]> {
    const superseded = new Set(
      [...this.entries.values()].flatMap((e) => e.change.parents),
    );
    const heads = new Map<string, VaultEntry[]>();
    for (const entry of this.entries.values()) {
      if (this.isRemoved(entry.commit.id)) continue;
      if (superseded.has(entry.commit.id)) continue;
      const siblings = heads.get(entry.change.entity) ?? [];
      siblings.push(entry);
      heads.set(entry.change.entity, siblings);
    }
    return heads;
  }
  async save(
    input: { change: VaultChange; value: string },
    options: VaultWorkOptions = {},
  ): Promise<void> {
    await this.run(
      async (authority) => {
        await this.loadLocal(authority);
        if (this.pending)
          throw new Error(
            'An encrypted draft exists. Resume or discard it first.',
          );
        if (!authority.offline) await this.pull(authority);
        if (!this.complete)
          throw new Error('Continue loading the vault before editing.');
        for (const id of input.change.parents) {
          if (this.isRemoved(id))
            throw new Error(
              'The previous version was removed. Create a new version explicitly.',
            );
          const parent = this.entries.get(id);
          if (
            !parent ||
            parent.change.entity !== input.change.entity ||
            parent.change.kind !== input.change.kind
          )
            throw new Error('Previous version invalid for this edit.');
        }
        const id = crypto.randomUUID();
        const identity = {
          accountId: authority.session.accountId,
          id,
          epoch: authority.epoch,
        };
        const key = await authority.key(authority.epoch);
        const bytes = await sealBlock(key, identity, input.value);
        const commit = await sealCommit({
          unsigned: {
            version: 1,
            ...identity,
            deviceId: authority.session.deviceId,
            directory: authority.directory,
            authorityRevision: authority.events.length,
            sequence: this.state.sequence + 1,
            previous: this.state.head,
            block: { hash: await bytesHash(bytes), bytes: bytes.length },
          },
          change: input.change,
          key,
          sign: authority.sign,
        });
        await saveDraft(authority.session.accountId, { commit, bytes });
        this.pending = { commit, bytes };
        if (!authority.offline) await this.publish(authority);
      },
      { options },
    );
  }
  private async publish(authority: VaultAuthority): Promise<void> {
    const pending = this.pending;
    if (!pending) return;
    const commit = pending.commit;
    if (
      commit.directory !== authority.directory ||
      commit.previous !== this.state.head ||
      commit.sequence !== this.state.sequence + 1
    ) {
      await this.rebase(authority, pending);
      return;
    }
    await api(authority, 'reserve', { commit });
    const response = object(
      await api(authority, 'upload', {
        commit,
        ciphertext: encode(pending.bytes),
      }),
    );
    if (
      response['status'] !== 'accepted' ||
      response['head'] !== (await commitHash(commit)) ||
      response['sequence'] !== commit.sequence
    )
      throw new Error(
        'Confirmation does not match. Draft preserved; sync to check.',
      );
    await this.pull(authority);
  }
  private async rebase(
    authority: VaultAuthority,
    pending: VaultDraft,
  ): Promise<void> {
    const change = await openManifest(
      await authority.key(pending.commit.epoch),
      pending.commit,
    );
    if (change.parents.some((id) => this.isRemoved(id)))
      throw new Error(
        'Draft predates cleanup. No removed content was republished; discard it or recreate explicitly.',
      );
    const value = await openBlock(
      await authority.key(pending.commit.epoch),
      pending.commit,
      pending.bytes,
    );
    const held = this.remotePending.find((c) => c.id === pending.commit.id);
    if (held) await api(authority, 'discard', { id: held.id });
    const identity = {
      accountId: authority.session.accountId,
      id: crypto.randomUUID(),
      epoch: authority.epoch,
    };
    const key = await authority.key(authority.epoch);
    const bytes = await sealBlock(key, identity, value);
    const commit = await sealCommit({
      unsigned: {
        version: 1,
        ...identity,
        deviceId: authority.session.deviceId,
        directory: authority.directory,
        authorityRevision: authority.events.length,
        sequence: this.state.sequence + 1,
        previous: this.state.head,
        block: { hash: await bytesHash(bytes), bytes: bytes.length },
      },
      change,
      key,
      sign: authority.sign,
    });
    await saveDraft(authority.session.accountId, { commit, bytes });
    this.pending = { commit, bytes };
    await this.publish(authority);
  }
  async retry(): Promise<void> {
    await this.run(async (authority) => {
      await this.loadLocal(authority);
      if (authority.offline)
        throw new Error(
          'Draft preserved. Reconnect to confirm it in the vault.',
        );
      await this.pull(authority);
      if (!this.complete) throw new Error('Continue loading before resuming.');
      await this.publish(authority);
    });
  }
  async discard(id?: string): Promise<void> {
    await this.run(async (authority) => {
      if (authority.offline)
        throw new Error(
          'Reconnect to release the remote reservation before discarding.',
        );
      await this.loadLocal(authority);
      await this.pull(authority);
      const target = id ?? this.pending?.commit.id;
      if (!target) return;
      if (this.entries.has(target))
        throw new Error(
          'The version was already confirmed. No accepted data was discarded.',
        );
      if (this.remotePending.some((c) => c.id === target))
        await api(authority, 'discard', { id: target });
      if (this.pending?.commit.id === target) {
        await saveDraft(authority.session.accountId, null);
        this.pending = null;
      }
      await this.pull(authority);
    });
  }
  async open(id: string): Promise<string> {
    return (await this.openMany([id]))[0]!;
  }
  /** At most sixteen immutable blocks share one verified authority/removal read. */
  async openMany(
    ids: readonly string[],
    options: VaultWorkOptions = {},
  ): Promise<string[]> {
    if (ids.length > 16 || new Set(ids).size !== ids.length)
      throw new Error('Invalid vault page.');
    if (!ids.length) return [];
    const page = [...ids];
    const generation = this.generation;
    return this.run(
      async (authority) => {
        const guard = () => {
          if (generation !== this.generation)
            throw new Error('Session changed.');
        };
        await this.removals.load(authority, guard);
        guard();
        const read = {
          authority,
          entries: this.entries,
          removed: (id: string) => this.isRemoved(id),
          guard,
        };
        const values = await openVaultObjects(read, page);
        // Recheck authorization/removals after decryption too. A cleanup or
        // revocation during this page must reject it before exposing any value.
        await this.removals.load(authority, guard);
        assertVaultObjectsAvailable(read, page);
        return values;
      },
      { options },
    );
  }
}
