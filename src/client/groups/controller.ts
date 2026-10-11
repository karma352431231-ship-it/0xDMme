import {
  groupQuota,
  groupTextQuota,
  groupMediaQuota,
} from '../../shared/group-quota/index.ts';
import { AccountError, object, uuid } from '../../shared/account/index.ts';
import type { AccountSession } from '../../shared/account/index.ts';
import { integer } from '../../shared/vault/index.ts';
import {
  groupConsent,
  groupEvent,
  groupEventHash,
} from '../../shared/groups/index.ts';
import type { GroupConsent, GroupEvent } from '../../shared/groups/index.ts';
import { attachmentContent } from '../../shared/attachments/index.ts';
import { messageApi } from '../message-api/index.ts';
import {
  PeerIdentity,
  readDirectories,
  peerHistory,
} from '../peer-identity/index.ts';
import { openMessageMachine } from '../message-session/index.ts';
import { ensureMessageRecovery } from '../message-recovery/index.ts';
import { downloadAttachment } from '../attachments/index.ts';
import type {
  AttachmentApi,
  AttachmentSelection,
} from '../attachments/index.ts';
import type { VaultAccess, VaultAuthority } from '../vault-authority/index.ts';
import type { VaultSync } from '../vault-sync/index.ts';
import { GroupGovernance } from './governance.ts';
import type { GroupState } from './governance.ts';
import { GroupCache, groupCacheScope, groupTitle } from './cache.ts';
import {
  createGroupEvent,
  changeGroupEvent,
  proposeGroupConsent,
} from './transitions.ts';
import { composeGroup, sendGroupPending, discardGroupDraft } from './outbox.ts';
import { readGroupPage } from './reader.ts';
import type { GroupView } from './reader.ts';
import { groupAttachmentApi } from './media.ts';
import { GroupCatalog } from './catalog.ts';
import { stageCurrentProfile } from './profile.ts';
import { GroupRetry } from './retry.ts';
import { searchGroupCopies } from './search.ts';
import {
  importGroupCatalog,
  localGroupViews,
  restoredGroupMedia,
} from './history.ts';
import { GroupAdmissions } from './admission.ts';
import { GroupAuthority } from './authority.ts';
import type { GroupContext } from './authority.ts';

export interface GroupSummary extends GroupState {
  title: string;
  profileSequence?: number;
  localOnly?: boolean;
}
interface GroupPrefetch {
  after: string | null;
  groups: GroupEvent[];
  before: number | null;
  listed: boolean;
  complete: boolean;
}
export class GroupController {
  private readonly retry = new GroupRetry();
  private readonly access: VaultAccess;
  private readonly visible: () => boolean;
  private readonly identities: PeerIdentity;
  private readonly authority: GroupAuthority;
  private session: AccountSession | null = null;
  private generation = 0;
  private prefetchAbort: AbortController | null = null;
  private prefetch: GroupPrefetch = {
    after: null,
    groups: [],
    before: null,
    listed: false,
    complete: false,
  };
  entries: GroupSummary[] = [];
  incoming: GroupConsent[] = [];
  next: string | null = null;
  incomingNext: string | null = null;
  mode: 'configured' | 'unavailable' = 'unavailable';
  warning = '';
  creationPending = false;
  private localNext: string | null = null;
  private remoteNext: string | null = null;
  private historyLoaded = false;
  selected: GroupSummary | null = null;
  views: GroupView[] = [];
  before: number | null = null;
  constructor(access: VaultAccess, sync: VaultSync, visible: () => boolean) {
    this.access = access;
    this.visible = visible;
    this.identities = new PeerIdentity(sync);
    this.authority = new GroupAuthority({
      access,
      identities: this.identities,
      session: () => this.session,
    });
  }
  setSession(session: AccountSession | null): void {
    const identity = (s: AccountSession | null) =>
      s ? [s.accountId, s.deviceId, s.csrf].join(':') : '';
    if (identity(session) !== identity(this.session)) {
      this.authority.invalidate();
      this.close();
      this.entries = [];
      this.incoming = [];
      this.identities.clear();
      this.next = null;
      this.incomingNext = null;
      this.mode = 'unavailable';
      this.warning = '';
      this.creationPending = false;
      this.localNext = null;
      this.remoteNext = null;
      this.historyLoaded = false;
      this.retry.clear();
    }
    this.session = session;
  }
  close(): void {
    this.pauseSynchronization();
    this.resetSynchronization();
    this.generation++;
    this.selected = null;
    this.views = [];
    this.before = null;
  }
  hide(): void {
    this.pauseSynchronization();
    this.generation++;
    this.views = [];
  }
  revokeAuthority(): void {
    this.authority.invalidate();
    this.hide();
  }
  private guard(generation: number): void {
    if (this.generation !== generation)
      throw new Error('Sessão ou grupo alterado.');
  }
  private withAuthority<T>(
    work: (context: GroupContext) => Promise<T>,
  ): Promise<T> {
    const generation = this.generation;
    return this.authority.run(() => this.guard(generation), work);
  }
  private async machine<T>(
    c: GroupContext,
    work: (
      machine: import('../message-crypto/index.ts').MessageCrypto,
    ) => Promise<T>,
  ): Promise<T> {
    await ensureMessageRecovery(c.authority, c.api);
    const machine = await openMessageMachine(c.authority, (op, data) =>
      c.api(op, data),
    );
    try {
      await machine.prepare(c.authority);
      return await work(machine);
    } finally {
      machine.close();
    }
  }
  private async withLocalAuthority<T>(
    work: (authority: VaultAuthority) => Promise<T>,
  ): Promise<T> {
    const generation = this.generation;
    if (!this.session) throw new Error('Entre e autorize este aparelho.');
    return this.access.withVault(true, async (authority) => {
      this.guard(generation);
      if (authority.session.accountId !== this.session?.accountId)
        throw new Error('Conta alterada.');
      const result = await work(authority);
      this.guard(generation);
      return result;
    });
  }
  async search(query: string, after: string | null) {
    const generation = this.generation;
    return this.withLocalAuthority((authority) =>
      searchGroupCopies({
        query,
        after,
        groups: this.entries.map((group) => group.state.groupId),
        read: (group, before) => localGroupViews(authority, group, before),
        guard: () => this.guard(generation),
      }),
    );
  }
  async refresh(more = false): Promise<void> {
    if (!more) this.resetSynchronization();
    if (!navigator.onLine) return this.refreshLocal(more);
    if (more && this.remoteNext === null) return this.refreshLocal(true, true);
    await this.identities.load();
    const data = await this.withAuthority(async (c) => {
      const mode = object(await c.api('group-mode', {}))['mode'];
      if (mode !== 'configured') throw new Error('Modo de grupos inválido.');
      this.mode = mode;
      const page = object(
        await c.api('group-list', { after: more ? this.remoteNext : null }),
      );
      if (!Array.isArray(page['items']) || page['items'].length > 16)
        throw new Error('Lista de grupos inválida.');
      const values: unknown[] = page['items'],
        entries: GroupSummary[] = [];
      if (values.length)
        await this.machine(c, async (machine) => {
          for (const input of values) {
            const raw = groupEvent(input),
              group = await c.governance.verify(raw.groupId);
            if ((await groupEventHash(raw)) !== group.head)
              throw new Error('A lista de grupos mudou. Atualize.');
            const profile = await c.api('group-profile', {
              groupId: raw.groupId,
              head: group.head,
            });
            await readGroupPage(
              { ...c, group, machine, identities: this.identities },
              profile,
            );
            if (
              (await stageCurrentProfile(c.authority, group)) &&
              this.retry.take(raw.groupId)
            ) {
              await sendGroupPending({
                ...c,
                group,
                machine,
                identities: this.identities,
              });
              await readGroupPage(
                { ...c, group, machine, identities: this.identities },
                await c.api('group-profile', {
                  groupId: raw.groupId,
                  head: group.head,
                }),
              );
              this.retry.reset(raw.groupId);
            }
            const cached = await new GroupCache(c.authority, raw.groupId).get(
              'profile',
            );
            const summary: GroupSummary = {
              ...group,
              profileSequence:
                cached === null
                  ? 0
                  : integer(
                      object(cached)['sequence'],
                      Number.MAX_SAFE_INTEGER,
                    ),
              title:
                cached === null
                  ? `Grupo ${raw.groupId.slice(0, 8)}`
                  : groupTitle(cached),
            };
            entries.push(summary);
            await new GroupCatalog(c.authority).save(summary);
            if (this.selected?.state.groupId === raw.groupId) {
              this.selected = summary;
              if (this.visible())
                await this.openVerified(c, group, machine, null);
            }
          }
        });
      return {
        entries,
        next: page['next'] === null ? null : uuid(page['next']),
      };
    });
    this.entries = more
      ? [
          ...this.entries,
          ...data.entries.filter(
            (e) =>
              !this.entries.some(
                (old) => old.state.groupId === e.state.groupId,
              ),
          ),
        ]
      : data.entries;
    this.remoteNext = data.next;
    await this.refreshLocal(more, true);
    await this.reconcileSelected();
    await this.refreshIncoming();
    await this.identities.save();
  }
  private async reconcileSelected(): Promise<void> {
    const selected = this.selected;
    if (
      !this.visible() ||
      !selected ||
      this.entries.some(
        (g) => g.state.groupId === selected.state.groupId && !g.localOnly,
      )
    )
      return;
    try {
      // A selected group can be outside the first list page. Verify it directly
      // rather than treating pagination as removal from the group.
      await this.open(selected.state.groupId);
    } catch (error: unknown) {
      if (!(error instanceof AccountError) || error.status !== 403) throw error;
      this.selected = { ...selected, localOnly: true };
    }
    this.entries = this.entries.filter(
      (g) => g.state.groupId !== selected.state.groupId,
    );
    if (this.selected) this.entries.push(this.selected);
  }
  private async refreshLocal(more: boolean, combine = false): Promise<void> {
    if (!navigator.onLine) this.remoteNext = null;
    const result = await this.withLocalAuthority(async (authority) => {
      if (!this.historyLoaded) {
        const generation = this.generation;
        await importGroupCatalog(authority, () => this.guard(generation));
        this.historyLoaded = true;
      }
      const catalog = new GroupCatalog(authority);
      this.creationPending = (await catalog.creation()) !== null;
      return catalog.page(more ? this.localNext : null);
    });
    const rows: GroupSummary[] = [];
    for (const item of result.items)
      rows.push({
        ...item,
        head: await groupEventHash(item.state),
        localOnly: true,
      });
    const existing = combine || more ? this.entries : [];
    this.entries = [
      ...existing,
      ...rows.filter(
        (g) => !existing.some((old) => old.state.groupId === g.state.groupId),
      ),
    ];
    this.localNext = result.next;
    this.next = this.remoteNext ?? this.localNext;
  }
  async refreshIncoming(more = false): Promise<void> {
    const page = object(
      await this.withAuthority((c) =>
        c.api('group-incoming', { after: more ? this.incomingNext : null }),
      ),
    );
    if (!Array.isArray(page['items']) || page['items'].length > 16)
      throw new Error('Convites de grupo inválidos.');
    const values: unknown[] = page['items'],
      items = values.map(groupConsent);
    this.incoming = more
      ? [
          ...this.incoming,
          ...items.filter((e) => !this.incoming.some((old) => old.id === e.id)),
        ]
      : items;
    this.incomingNext = page['next'] === null ? null : uuid(page['next']);
  }
  pauseSynchronization(): void {
    this.prefetchAbort?.abort();
  }
  private resetSynchronization(): void {
    this.prefetch = {
      after: null,
      groups: [],
      before: null,
      listed: false,
      complete: false,
    };
  }
  /** Prepares every authorized group without selecting it or marking it read. */
  async synchronizeAll(signal: AbortSignal): Promise<boolean> {
    if (this.prefetch.complete) return false;
    const generation = this.generation,
      abort = new AbortController();
    this.prefetchAbort = abort;
    const combined = AbortSignal.any([signal, abort.signal]);
    const guard = () => {
      combined.throwIfAborted();
      this.guard(generation);
    };
    const progress = this.prefetch;
    try {
      const more = await this.access.withVault(false, async (authority) => {
        guard();
        if (authority.session.accountId !== this.session?.accountId)
          throw new Error('Conta alterada.');
        const api = (op: string, payload: Record<string, unknown>) =>
          messageApi(authority, op, payload, { guard, signal: combined });
        if (!(await this.loadPrefetchGroups(progress, api))) return false;
        const governance = new GroupGovernance(this.identities, api, authority);
        await this.prefetchGroupPage(
          { authority, api, governance, guard },
          progress,
        );
        return true;
      });
      guard();
      await this.identities.save(guard);
      guard();
      return more;
    } finally {
      if (this.prefetchAbort === abort) this.prefetchAbort = null;
    }
  }
  private async loadPrefetchGroups(
    progress: GroupPrefetch,
    api: AttachmentApi,
  ): Promise<boolean> {
    if (progress.groups.length) return true;
    if (progress.listed && progress.after === null) {
      progress.complete = true;
      return false;
    }
    const { groups, next } = this.prefetchGroupList(
      await api('group-list', { after: progress.after }),
      progress.after,
    );
    progress.groups = groups;
    progress.after = next;
    progress.listed = true;
    progress.complete = !groups.length && next === null;
    return !progress.complete;
  }
  private prefetchGroupList(
    value: unknown,
    after: string | null,
  ): { groups: GroupEvent[]; next: string | null } {
    const page = object(value);
    if (!Array.isArray(page['items']) || page['items'].length > 16)
      throw new Error('Lista de grupos inválida.');
    const groups = page['items'].map((input) => groupEvent(input));
    const next = page['next'] === null ? null : uuid(page['next']);
    if (next !== null && (next === after || !groups.length))
      throw new Error('Paginação de grupos divergente.');
    return { groups, next };
  }
  private async prefetchGroupPage(
    c: GroupContext & { guard: () => void },
    progress: GroupPrefetch,
  ): Promise<void> {
    const group = await c.governance.verify(progress.groups[0]!.groupId);
    const raw = object(
      await c.api('group-message-recent', {
        groupId: group.state.groupId,
        head: group.head,
        before: progress.before,
      }),
    );
    await this.machine(c, async (machine) => {
      const page = await readGroupPage(
        { ...c, group, machine, identities: this.identities },
        raw,
      );
      c.guard();
      if (page.receipts.length)
        await c.api('group-message-received', {
          groupId: group.state.groupId,
          head: group.head,
          items: page.receipts,
        });
    });
    await this.confirm(c.api, group);
    c.guard();
    const before =
      raw['next'] === null
        ? null
        : integer(raw['next'], Number.MAX_SAFE_INTEGER);
    if (
      before !== null &&
      progress.before !== null &&
      before >= progress.before
    )
      throw new Error('Paginação de grupo divergente.');
    progress.before = before;
    if (before === null) progress.groups.shift();
  }
  async open(groupId: string, older = false, localOnly = false): Promise<void> {
    if (!navigator.onLine || localOnly) return this.openLocal(groupId, older);
    const generation = this.generation;
    this.views = [];
    await this.identities.load();
    this.guard(generation);
    await this.withAuthority(async (c) => {
      const group = await c.governance.verify(groupId),
        cache = new GroupCache(c.authority, groupId);
      const profile = await cache.get('profile'),
        title =
          profile === null
            ? `Grupo ${groupId.slice(0, 8)}`
            : groupTitle(profile);
      this.selected = { ...group, title };
      this.warning = '';
      if (c.authority.offline)
        throw new Error(
          'Conecte-se para conferir a participação atual do grupo.',
        );
      await this.machine(c, async (machine) => {
        await this.openVerified(c, group, machine, older ? this.before : null);
      });
    });
    await this.identities.save();
    this.guard(generation);
  }
  private async openVerified(
    c: GroupContext,
    group: GroupState,
    machine: import('../message-crypto/index.ts').MessageCrypto,
    before: number | null,
  ): Promise<void> {
    this.views = [];
    this.warning = '';
    const raw = object(
      await c.api('group-message-recent', {
        groupId: group.state.groupId,
        head: group.head,
        before,
      }),
    );
    const page = await readGroupPage(
      { ...c, group, machine, identities: this.identities },
      raw,
    );
    if (page.receipts.length)
      await c.api('group-message-received', {
        groupId: group.state.groupId,
        head: group.head,
        items: page.receipts,
      });
    await this.confirm(c.api, group);
    this.before =
      raw['next'] === null
        ? null
        : integer(raw['next'], Number.MAX_SAFE_INTEGER);
    this.views = page.views.filter((v) => v.kind !== 'profile');
    await this.readViews(c.api, group);
  }
  private async openLocal(groupId: string, older: boolean): Promise<void> {
    const group = this.entries.find((g) => g.state.groupId === groupId);
    if (!group) throw new Error('Cópia local de grupo ausente.');
    await this.withAuthority(async (c) => {
      const page = await localGroupViews(
        c.authority,
        groupId,
        older ? this.before : null,
      );
      this.selected = { ...group, localOnly: true };
      this.views = page.views;
      this.before = page.before;
      this.warning =
        'Cópia local independente. Envio e administração exigem participação atual verificada.';
    });
  }
  historyChanged(): void {
    this.historyLoaded = false;
  }
  private async readViews(
    api: AttachmentApi,
    group: GroupState,
  ): Promise<void> {
    const scope = { groupId: group.state.groupId, head: group.head };
    const ids = this.views
      .filter((v) => !v.own && !v.unavailableMedia.length && !v.localOnly)
      .map((v) => v.id);
    if (ids.length && document.visibilityState === 'visible' && this.visible())
      await this.recordReads(api, group, ids);
    const own = this.views
      .filter((v) => v.own && !v.localOnly)
      .map((v) => v.id);
    if (!own.length) return;
    const raw = await api('group-daily-receipts', { ...scope, ids: own });
    this.applyReceipts(raw);
  }
  private async recordReads(
    api: AttachmentApi,
    group: GroupState,
    ids: string[],
  ): Promise<void> {
    try {
      await api('group-daily-read', {
        groupId: group.state.groupId,
        head: group.head,
        ids,
      });
    } catch (error: unknown) {
      if (!(error instanceof AccountError) || error.status !== 413) throw error;
      await this.confirm(api, group);
      this.warning =
        'Mensagens abertas. Cofre pessoal cheio: a leitura não pôde ser registrada.';
    }
  }
  private applyReceipts(raw: unknown): void {
    if (!Array.isArray(raw) || raw.length > 16)
      throw new Error('Checks de grupo inválidos.');
    for (const input of raw) {
      const d = object(input);
      if (typeof d['received'] !== 'boolean' || typeof d['read'] !== 'boolean')
        throw new Error('Recebimento inválido.');
      const view = this.views.find((v) => v.id === uuid(d['id']));
      if (view) {
        view.delivery = d['received'] ? 'received' : 'accepted';
        view.read = d['read'];
      }
    }
  }
  async create(title: string): Promise<string> {
    const checked = groupTitle({ version: 1, title });
    let created: string | null = null;
    this.warning = '';
    await this.identities.load();
    try {
      await this.authority.mutate(async (c) => {
        const catalog = new GroupCatalog(c.authority),
          pending = await catalog.creation();
        if (pending && pending.title !== checked)
          throw new Error(
            'Retome a criação pendente com o mesmo nome ou descarte esse pedido antes de criar outro grupo.',
          );
        const event =
            pending?.event ??
            (await createGroupEvent(c.authority, crypto.randomUUID())),
          id = event.groupId;
        await catalog.saveCreation(event, checked);
        this.creationPending = true;
        await this.commit(c, event);
        created = id;
        await catalog.save({ state: event, title: checked });
        await new GroupCache(c.authority, id).put('profile', {
          version: 1,
          title: checked,
          epoch: 0,
          sequence: 0,
        });
        await catalog.clearCreation();
        this.creationPending = false;
        await composeGroup({
          authority: c.authority,
          groupId: id,
          text: JSON.stringify({ version: 1, title: checked }),
          selection: null,
          kind: 'profile',
        });
        const group = { state: event, head: await groupEventHash(event) };
        await this.machine(c, (machine) =>
          sendGroupPending({
            ...c,
            group,
            machine,
            identities: this.identities,
          }),
        );
      });
      await this.identities.save();
    } catch (error: unknown) {
      if (created === null) throw error;
      this.warning = `Grupo criado. Nome ou sincronização pendente: ${error instanceof Error ? error.message : 'retome ao abrir o grupo.'}`;
    }
    if (created === null)
      throw new Error('Criação não confirmada. Retome o mesmo pedido.');
    return created;
  }
  async cancelCreation(): Promise<void> {
    await this.withAuthority((c) =>
      new GroupCatalog(c.authority).clearCreation(),
    );
    this.creationPending = false;
  }
  async change(input: {
    kind: 'leave' | 'remove' | 'role' | 'delete';
    target: string | null;
    role?: 'admin' | 'member';
  }): Promise<void> {
    const selected = this.selected;
    if (!selected) throw new Error('Abra um grupo primeiro.');
    await this.identities.load();
    await this.authority.mutate(async (c) => {
      const group = await c.governance.verify(selected.state.groupId);
      const event = await changeGroupEvent({
        authority: c.authority,
        state: group.state,
        ...input,
      });
      await this.commit(c, event);
    });
    await this.identities.save();
    if (input.kind === 'leave' || input.kind === 'delete') this.close();
  }
  private async commit(c: GroupContext, event: GroupEvent): Promise<void> {
    const result = object(await c.api('group-commit', { event }));
    if (
      result['status'] !== 'saved' ||
      result['head'] !== (await groupEventHash(event))
    )
      throw new Error('Mudança no grupo não confirmada.');
    await new GroupCache(c.authority, event.groupId).preserve(event);
  }
  async admission(
    action: 'add' | 'link' | 'revoke' | 'join',
    value = '',
  ): Promise<string | void> {
    await this.identities.load();
    const groupId = this.selected?.state.groupId;
    if (action !== 'join' && !groupId)
      throw new Error('Abra um grupo primeiro.');
    const result = await this.authority.mutate(async (c) => {
      const admission = new GroupAdmissions({
        ...c,
        identities: this.identities,
      });
      if (action === 'join') return admission.join(value);
      if (!groupId) throw new Error('Abra um grupo primeiro.');
      if (action === 'add') return admission.add(groupId, value);
      if (action === 'link') return admission.link(groupId);
      return admission.revoke(groupId);
    });
    await this.identities.save();
    return result;
  }
  async propose(target: string, kind: GroupConsent['kind']): Promise<void> {
    const selected = this.selected;
    if (!selected) throw new Error('Abra um grupo primeiro.');
    await this.identities.load();
    await this.withAuthority(async (c) => {
      const group = await c.governance.verify(selected.state.groupId);
      let history: import('../../shared/devices/index.ts').DirectoryEvent[];
      if (kind === 'invite') {
        history = await peerHistory(
          c.api,
          target,
          null,
          this.identities.get(target),
        );
        await this.identities.remember(target, history);
      } else {
        const directories = await readDirectories({
          accounts: [target],
          identities: this.identities,
          load: (accounts) =>
            c.api('group-directory', {
              groupId: group.state.groupId,
              head: group.head,
              accounts,
            }),
        });
        history = directories.get(target)?.events ?? [];
      }
      const current = history.at(-1);
      if (!current) throw new Error('Identidade do destinatário ausente.');
      const consent = await proposeGroupConsent({
        authority: c.authority,
        state: group.state,
        target: current,
        kind,
      });
      await c.api('group-propose', { consent });
    });
    await this.identities.save();
  }
  async respond(consent: GroupConsent, accept: boolean): Promise<void> {
    await this.identities.load();
    await this.authority.mutate(async (c) => {
      if (!accept) {
        await c.api('group-cancel', { id: consent.id });
        return;
      }
      const group = await c.governance.invitation(consent);
      const event = await changeGroupEvent({
        authority: c.authority,
        state: group.state,
        kind: consent.kind === 'invite' ? 'join' : 'transfer',
        target: c.authority.session.accountId,
        consent,
      });
      await this.commit(c, event);
    });
    await this.identities.save();
  }
  async compose(
    text: string,
    selection: AttachmentSelection | null,
  ): Promise<void> {
    const selected = this.selected;
    if (!selected) throw new Error('Abra um grupo primeiro.');
    await this.withAuthority((c) =>
      composeGroup({
        authority: c.authority,
        groupId: selected.state.groupId,
        text,
        selection,
      }),
    );
  }
  async sendPending(): Promise<void> {
    const selected = this.selected;
    if (!selected) return;
    this.retry.reset(selected.state.groupId);
    await this.sendSelectedPending(selected);
  }
  async resumePending(): Promise<boolean> {
    const selected = this.selected;
    if (!selected || selected.localOnly || !navigator.onLine) return false;
    if (
      !(await this.pending()).length ||
      !this.retry.take(selected.state.groupId)
    )
      return false;
    await this.sendSelectedPending(selected);
    this.retry.reset(selected.state.groupId);
    return true;
  }
  private async sendSelectedPending(selected: GroupSummary): Promise<void> {
    await this.identities.load();
    await this.withAuthority(async (c) => {
      const group = await c.governance.verify(selected.state.groupId);
      await this.machine(c, (machine) =>
        sendGroupPending({ ...c, group, machine, identities: this.identities }),
      );
    });
    await this.identities.save();
  }
  async pending(): Promise<{ id: string; text: string }[]> {
    const selected = this.selected;
    if (!selected) return [];
    return this.withLocalAuthority(async (authority) => {
      const page = await new GroupCache(authority, selected.state.groupId).page(
        'outbox:',
        null,
      );
      return page.items.map((row) => {
        const d = object(row.value);
        return {
          id: uuid(d['id']),
          text: typeof d['text'] === 'string' ? d['text'] : '',
        };
      });
    });
  }
  async discard(id: string): Promise<void> {
    const selected = this.selected;
    if (!selected) return;
    await this.withAuthority((c) =>
      discardGroupDraft(c.authority, selected.state.groupId, id),
    );
  }
  async media(
    view: GroupView,
    thumbnail: boolean,
  ): Promise<Uint8Array<ArrayBuffer>> {
    const selected = this.selected;
    if (
      !selected ||
      !this.views.some((v) => v.id === view.id && v.hash === view.hash)
    )
      throw new Error('Mensagem do grupo mudou.');
    const generation = this.generation;
    return this.withAuthority(async (c) => {
      if (selected.localOnly || !navigator.onLine)
        return this.localMedia(c.authority, view, thumbnail, generation);
      const group = await c.governance.verify(selected.state.groupId),
        content = attachmentContent(JSON.parse(view.text) as unknown),
        file = thumbnail ? content.thumbnail : content.file;
      if (!file) throw new Error('Prévia indisponível.');
      await this.confirm(c.api, group);
      const bytes = await downloadAttachment({
        account: groupCacheScope(
          c.authority.session.accountId,
          group.state.groupId,
        ),
        message: view.id,
        file,
        thumbnail,
        image: thumbnail || content.image,
        api: groupAttachmentApi(group, c.api),
        snapshot: null,
        guard: () => this.guard(generation),
        budget: groupQuota,
      });
      try {
        await this.confirm(c.api, group);
        return bytes;
      } catch (error: unknown) {
        bytes.fill(0);
        throw error;
      }
    });
  }
  private async localMedia(
    authority: VaultAuthority,
    view: GroupView,
    thumbnail: boolean,
    generation: number,
  ): Promise<Uint8Array<ArrayBuffer>> {
    const restored = await restoredGroupMedia(authority, view, thumbnail);
    if (restored !== null) {
      try {
        this.guard(generation);
        return restored;
      } catch (error: unknown) {
        restored.fill(0);
        throw error;
      }
    }
    const content = attachmentContent(JSON.parse(view.text) as unknown),
      file = thumbnail ? content.thumbnail : content.file;
    if (!file) throw new Error('Prévia ausente.');
    return downloadAttachment({
      account: groupCacheScope(authority.session.accountId, view.groupId),
      message: view.id,
      file,
      thumbnail,
      image: thumbnail || content.image,
      api: () =>
        Promise.reject(new Error('Mídia não conservada nesta cópia local.')),
      snapshot: null,
      guard: () => this.guard(generation),
      budget: groupQuota,
    });
  }
  private async confirm(api: AttachmentApi, group: GroupState): Promise<void> {
    const current = groupEvent(
      await api('group-current', { groupId: group.state.groupId }),
    );
    if ((await groupEventHash(current)) !== group.head)
      throw new Error('A participação do grupo mudou. Atualize.');
  }
  async state(
    group: GroupState,
  ): Promise<{ revision: number; mutedUntil: number; unread: number }> {
    const d = object(
      await this.withAuthority((c) =>
        c.api('group-daily-state', {
          groupId: group.state.groupId,
          head: group.head,
        }),
      ),
    );
    return {
      revision: integer(d['revision'], Number.MAX_SAFE_INTEGER),
      mutedUntil: integer(Number(d['mutedUntil']), Number.MAX_SAFE_INTEGER),
      unread: integer(d['unread'], Number.MAX_SAFE_INTEGER),
    };
  }
  async vault(after = 0): Promise<{
    textBytes: number;
    mediaBytes: number;
    notice: { dueAt: number; bytes: number } | null;
    items: { message: string; bytes: number }[];
    next: number | null;
  }> {
    const selected = this.selected;
    if (!selected) throw new Error('Abra um grupo primeiro.');
    return this.withAuthority(async (c) => {
      const scope = { groupId: selected.state.groupId, head: selected.head };
      const text = object(await c.api('group-message-usage', scope)),
        media = object(await c.api('group-media-usage', scope)),
        cleanup = object(
          await c.api('group-cleanup-notice', { ...scope, after }),
        );
      const raw = cleanup['notice'],
        notice = raw === null ? null : object(raw);
      if (!Array.isArray(cleanup['items']))
        throw new Error('Aviso de limpeza inválido.');
      return {
        textBytes: integer(text['textBytes'], groupTextQuota),
        mediaBytes: integer(media['mediaBytes'], groupMediaQuota),
        notice: notice
          ? {
              dueAt: integer(notice['dueAt'], Number.MAX_SAFE_INTEGER),
              bytes: integer(notice['bytes'], groupMediaQuota),
            }
          : null,
        items: cleanup['items'].map((input) => {
          const row = object(input);
          return {
            message: uuid(row['message']),
            bytes: integer(row['bytes'], 6_000_000),
          };
        }),
        next:
          cleanup['next'] === null
            ? null
            : integer(cleanup['next'], Number.MAX_SAFE_INTEGER),
      };
    });
  }
  async clearVault(): Promise<void> {
    const selected = this.selected;
    if (!selected) throw new Error('Abra um grupo primeiro.');
    await this.withAuthority(async (c) => {
      const group = await c.governance.verify(selected.state.groupId);
      await c.api('group-vault-clear', {
        groupId: group.state.groupId,
        head: group.head,
      });
    });
  }
}
