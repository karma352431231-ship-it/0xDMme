import { fetchApi, readApiJson } from '../api-response/index.ts';
import { RemovalIndex } from '../personal-removals/index.ts';
import { base64, encode, object } from '../../shared/account/index.ts';
import type { AccountSession } from '../../shared/account/index.ts';
import {
  blockLimit,
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
} from '../vault-authority/index.ts';
import {
  openBlock,
  openManifest,
  sealBlock,
  sealCommit,
} from '../vault-crypto/index.ts';
import {
  cacheBlock,
  cachedBlock,
  cachedPage,
  checkpoint,
  commitPage,
  draft,
  saveDraft,
  localLocator,
} from '../vault-storage/index.ts';
import type { VaultCheckpoint, VaultDraft } from '../vault-storage/index.ts';
import { readPage } from './protocol.ts';
import type { VaultPage } from './protocol.ts';
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
    throw new Error('Página de cofre omitida.');
  if (page.sequence === next.sequence && page.head !== next.head)
    throw new Error('Cofre remoto divergente do checkpoint.');
}
async function api(
  authority: VaultAuthority,
  path: string,
  input: unknown,
): Promise<unknown> {
  if (authority.offline)
    throw new Error(
      'Cópia local apenas. Entre e confira a autorização para sincronizar com o servidor.',
    );
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Hash-Talk-CSRF': authority.session.csrf,
  };
  if (path === 'upload')
    headers['X-0xdmme-Vault-Id'] = String(
      object(object(input)['commit'])['id'],
    );
  const response = await fetchApi(
    `vault/${path}`,
    `/api/account/vault/${path}`,
    {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      redirect: 'error',
      headers,
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(8000),
    },
  );
  const data = await readApiJson(response, `vault/${path}`);
  return data;
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
  ): Promise<T> {
    const session = this.localOnly ? null : this.session;
    const generation = this.generation;
    const locator = session ?? this.locator;
    if (!locator)
      throw new Error(
        'Conecte a wallet original ou abra uma cópia local autorizada.',
      );
    const operation = async (authority: VaultAuthority) => {
      if (
        authority.session.accountId !== locator.accountId ||
        authority.session.deviceId !== locator.deviceId ||
        generation !== this.generation
      )
        throw new Error('Sessão alterada.');
      let result: T;
      try {
        result = await work(authority);
      } finally {
        if (generation !== this.generation) this.clear();
      }
      if (generation !== this.generation)
        throw new Error('Sessão alterada durante a sincronização.');
      return result;
    };
    return session
      ? this.access.withVault(!navigator.onLine, operation)
      : this.access.withLocalVault(locator, operation);
  }
  async openLocal(): Promise<void> {
    this.locator = await localLocator();
    this.localOnly = true;
    await this.run((authority) => this.loadLocal(authority));
  }
  get localOpened(): boolean {
    return this.locator !== null;
  }
  async refresh(): Promise<void> {
    if (this.session) this.localOnly = false;
    await this.run(async (authority) => {
      await this.loadLocal(authority);
      if (!authority.offline) await this.pull(authority);
    });
  }
  private async readEntry(
    authority: VaultAuthority,
    input: unknown,
  ): Promise<VaultEntry> {
    const raw = object(input);
    const event = authority.events[integer(raw['authorityRevision'], 128) - 1];
    if (!event)
      throw new Error('Manifesto referencia autoridade desconhecida.');
    const commit = await verifyCommit(input, event);
    if (commit.accountId !== authority.session.accountId)
      throw new Error('Manifesto de outra conta.');
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
        throw new Error('Relação de versões privada inválida.');
    }
    return { commit, change };
  }
  private async loadLocal(authority: VaultAuthority): Promise<void> {
    await this.removals.load(authority, () => {
      if (
        this.session &&
        this.session.accountId !== authority.session.accountId
      )
        throw new Error('Sessão alterada.');
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
      throw new Error('Checkpoint local corrompido.');
  }
  private async pull(authority: VaultAuthority): Promise<void> {
    if (!this.complete) return;
    for (let page = 0; page < 8; page++) {
      await this.acceptPage(
        authority,
        readPage(await api(authority, 'read', { after: this.state.sequence })),
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
          throw new Error('Operação repetida na cadeia.');
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
          'Identificador confirmado com conteúdo divergente. Rascunho preservado.',
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
  async save(input: { change: VaultChange; value: string }): Promise<void> {
    await this.run(async (authority) => {
      await this.loadLocal(authority);
      if (this.pending)
        throw new Error('Há um rascunho cifrado. Retome ou descarte primeiro.');
      if (!authority.offline) await this.pull(authority);
      if (!this.complete)
        throw new Error('Continue carregando o cofre antes de editar.');
      for (const id of input.change.parents) {
        if (this.isRemoved(id))
          throw new Error(
            'A versão anterior foi removida. Crie uma nova versão deliberadamente.',
          );
        const parent = this.entries.get(id);
        if (
          !parent ||
          parent.change.entity !== input.change.entity ||
          parent.change.kind !== input.change.kind
        )
          throw new Error('Versão anterior inválida para esta edição.');
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
    });
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
        'Confirmação divergente. Rascunho preservado; sincronize para conferir.',
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
        'Rascunho anterior à limpeza. Nenhum conteúdo removido foi republicado; descarte-o ou recrie deliberadamente.',
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
          'Rascunho preservado. Reconecte para confirmar no cofre.',
        );
      await this.pull(authority);
      if (!this.complete)
        throw new Error('Continue carregando antes de retomar.');
      await this.publish(authority);
    });
  }
  async discard(id?: string): Promise<void> {
    await this.run(async (authority) => {
      if (authority.offline)
        throw new Error(
          'Reconecte para liberar a reserva remota antes de descartar.',
        );
      await this.loadLocal(authority);
      await this.pull(authority);
      const target = id ?? this.pending?.commit.id;
      if (!target) return;
      if (this.entries.has(target))
        throw new Error(
          'A versão já foi confirmada. Nenhum dado aceito foi descartado.',
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
    return this.run(async (authority) => {
      const entry = this.entries.get(id);
      if (!entry) throw new Error('Carregue esta versão primeiro.');
      if (this.isRemoved(id))
        throw new Error(
          'Versão removida do cofre pessoal. Consulte o backup independente.',
        );
      let bytes = authority.offline
        ? await cachedBlock(authority.session.accountId, id)
        : null;
      if (!bytes) {
        if (authority.offline)
          throw new Error(
            'Este bloco ainda não está no aparelho. Reconecte para carregar.',
          );
        const data = object(await api(authority, 'object', { id }));
        if (data['id'] !== id) throw new Error('Objeto divergente.');
        bytes = base64(data['ciphertext'], blockLimit);
      }
      const value = await openBlock(
        await authority.key(entry.commit.epoch),
        entry.commit,
        bytes,
      );
      await cacheBlock(authority.session.accountId, id, bytes);
      return value;
    });
  }
}
