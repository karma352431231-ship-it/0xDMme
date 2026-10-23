import { GroupMessageLease } from './message-lease.ts';
import { cachedGroupDescription } from './description.ts';
import {
  creationProfile,
  assertCreationProfile,
  stageCreationProfile,
} from './creation-profile.ts';
import { publishGroupProfile } from './profile-edit.ts';
import { groupDescription } from '../../shared/group-messages/index.ts';
import { MessageContinuation } from '../synchronization-work/index.ts';
import type { MessageWorkResult } from '../synchronization-work/index.ts';
import {
  SelectionWork,
  WorkInterruption,
  expectedInterruption,
} from '../synchronization-work/index.ts';
import { IncompleteGroupIndex } from './message-index.ts';
import { t, translatedError } from '../../shared/i18n/index.ts';
import { GroupMessageWindows } from './message-windows.ts';
import { groupManager } from '../../shared/groups/index.ts';
import { cachedGroupPhoto } from './photo.ts';
import { groupPhoto } from '../../shared/group-messages/index.ts';
import type { GroupPhoto } from '../../shared/group-messages/index.ts';
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
import { memberWalletPage } from './member-wallets.ts';
import type { MemberWallet } from './member-wallets.ts';
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
import {
  composeGroup,
  sendGroupPending,
  discardGroupDraft,
  staleGroupSend,
} from './outbox.ts';
import { readGroupPage } from './reader.ts';
import type { GroupView } from './reader.ts';
import { groupAttachmentApi } from './media.ts';
import { GroupCatalog } from './catalog.ts';
import { stageCurrentProfile, publishGroupPhoto } from './profile.ts';
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
  private readonly messageWindows = new GroupMessageWindows();
  historyPending = false;
  private readonly access: VaultAccess;
  private readonly visible: () => boolean;
  private readonly identities: PeerIdentity;
  private readonly authority: GroupAuthority;
  private session: AccountSession | null = null;
  private generation = 0;
  private readonly selection = new SelectionWork();
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
      this.messageWindows.clear();
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
  /** Leave only the visible group; account receipt and confirmed cursors survive. */
  deselect(): void {
    this.selection.invalidate();
    this.historyPending = false;
    this.selected = null;
    this.views = [];
    this.before = null;
  }
  close(): void {
    this.deselect();
    this.historyPending = false;
    this.pauseSynchronization();
    this.resetSynchronization();
    this.generation++;
  }
  removed(): void {
    this.selection.invalidate('removal');
    this.messageWindows.clear();
    this.pauseSynchronization();
    this.historyPending = true;
  }
  hide(): void {
    this.resetSynchronization();
    this.selection.invalidate('authorization');
    this.messageWindows.clear();
    this.historyPending = false;
    this.pauseSynchronization();
    this.generation++;
    this.views = [];
  }
  revokeAuthority(): void {
    this.authority.invalidate();
    this.hide();
  }
  private guard(generation: number): void {
    if (this.generation !== generation) throw new WorkInterruption('session');
  }
  private withAuthority<T>(
    work: (context: GroupContext) => Promise<T>,
    selection?: () => void,
  ): Promise<T> {
    const generation = this.generation;
    return this.authority.run(() => {
      this.guard(generation);
      selection?.();
    }, work);
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
    if (!this.session) throw new Error('Sign in and authorize this device.');
    return this.access.withVault(true, async (authority) => {
      this.guard(generation);
      if (authority.session.accountId !== this.session?.accountId)
        throw new Error('Account changed.');
      const result = await work(authority);
      this.guard(generation);
      return result;
    });
  }
  async search(query: string, after: string | null) {
    if (this.historyPending && navigator.onLine)
      throw new Error('Verify deletions before searching.');
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
    if (!navigator.onLine) return this.refreshLocal(more);
    if (more && this.remoteNext === null) return this.refreshLocal(true, true);
    await this.identities.load();
    const data = await this.withAuthority(async (c) => {
      const mode = object(await c.api('group-mode', {}))['mode'];
      if (mode !== 'configured') throw new Error('Invalid group mode.');
      this.mode = mode;
      const page = object(
        await c.api('group-list', { after: more ? this.remoteNext : null }),
      );
      if (!Array.isArray(page['items']) || page['items'].length > 16)
        throw new Error('Invalid group list.');
      const values: unknown[] = page['items'],
        entries: GroupSummary[] = [];
      if (values.length)
        await this.machine(c, async (machine) => {
          for (const input of values) {
            const raw = groupEvent(input),
              group = await c.governance.verify(raw.groupId);
            if ((await groupEventHash(raw)) !== group.head)
              throw new Error('The group list changed. Refresh it.');
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
                  ? t('Group {0}', [raw.groupId.slice(0, 8)])
                  : groupTitle(cached),
            };
            entries.push(summary);
            await new GroupCatalog(c.authority).save(summary);
            if (this.selected?.state.groupId === raw.groupId) {
              this.selected = summary;
              if (this.visible())
                await this.openVerified(c, group, null, machine).catch(
                  (error: unknown) => {
                    if (!expectedInterruption(error)) throw error;
                  },
                );
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
      const next = await this.open(selected.state.groupId);
      if (next) this.historyPending = true;
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
      throw new Error('Invalid group invitations.');
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
    this.prefetchAbort?.abort(new WorkInterruption('scheduler'));
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
    if (this.prefetch.complete) this.resetSynchronization();
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
          throw new Error('Account changed.');
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
      throw new Error('Invalid group list.');
    const groups = page['items'].map((input) => groupEvent(input));
    const next = page['next'] === null ? null : uuid(page['next']);
    if (next !== null && (next === after || !groups.length))
      throw new Error('Group list pagination does not match.');
    return { groups, next };
  }
  private async prefetchGroupPage(
    c: GroupContext & { guard: () => void },
    progress: GroupPrefetch,
  ): Promise<void> {
    const group = await c.governance.verify(progress.groups[0]!.groupId);
    const prepared =
      progress.before === null &&
      this.messageWindows.prepared(group.state.groupId);
    const lease = new GroupMessageLease({
      ...c,
      group,
      identities: this.identities,
    });
    let page;
    try {
      page = await this.messageWindows.read(
        {
          ...c,
          indexPages: 1,
          group,
          identities: this.identities,
          read: (raw) => lease.read(raw),
        },
        progress.before,
      );
    } finally {
      lease.close();
    }
    c.guard();
    progress.before = prepared ? null : page.before;
    if (progress.before === null) {
      this.messageWindows.finishPreparation(group.state.groupId);
      progress.groups.shift();
    }
  }
  async open(
    groupId: string,
    older = false,
    localOnly = false,
  ): Promise<MessageWorkResult> {
    this.selection.invalidate('replacement');
    const generation = this.generation;
    const guard = this.selection.capture(() => this.guard(generation));
    return this.openSelected({ groupId, older, localOnly, guard });
  }
  private async openSelected(input: {
    groupId: string;
    older: boolean;
    localOnly: boolean;
    guard: () => void;
  }): Promise<MessageWorkResult> {
    const { groupId, older, localOnly, guard } = input;
    guard();
    if (!navigator.onLine || localOnly) return this.openLocal(groupId, older);
    await this.identities.load();
    guard();
    const complete = await this.withAuthority(async (c) => {
      const group = await c.governance.verify(groupId),
        profile = await new GroupCache(c.authority, groupId).get('profile');
      guard();
      if (this.selected?.state.groupId !== groupId) this.views = [];
      this.selected = {
        ...group,
        title:
          profile === null
            ? t('Group {0}', [groupId.slice(0, 8)])
            : groupTitle(profile),
      };
      this.warning = '';
      if (c.authority.offline)
        throw new Error('Connect to check current group membership.');
      return this.openVerified(c, group, older ? this.before : null);
    }, guard);
    guard();
    await this.identities.save(guard);
    guard();
    if (!complete)
      return new MessageContinuation(() => this.openSelected(input));
  }
  private async openVerified(
    c: GroupContext,
    group: GroupState,
    before: number | null,
    machine?: import('../message-crypto/index.ts').MessageCrypto,
  ): Promise<boolean> {
    const generation = this.generation,
      guard = this.selection.capture(() => this.guard(generation));
    this.warning = '';
    const lease = new GroupMessageLease(
      { ...c, group, identities: this.identities },
      machine,
    );
    try {
      const page = await this.messageWindows.read(
        {
          ...c,
          guard,
          indexPages: 1,
          group,
          identities: this.identities,
          read: (raw) => lease.read(raw),
        },
        before,
      );
      guard();
      this.before = page.before;
      this.views = page.views;
      this.historyPending = false;
    } catch (error: unknown) {
      guard();
      if (error instanceof IncompleteGroupIndex) {
        this.historyPending = true;
        return false;
      }
      if (expectedInterruption(error)) throw error;
      this.views = [];
      this.historyPending = false;
      throw error;
    } finally {
      lease.close();
    }
    await this.readViews(async (op, payload) => {
      guard();
      const result = await c.api(op, payload);
      guard();
      return result;
    }, group);
    guard();
    return true;
  }
  private async openLocal(groupId: string, older: boolean): Promise<void> {
    this.selection.invalidate('replacement');
    const generation = this.generation,
      guard = this.selection.capture(() => this.guard(generation));
    const group = this.entries.find((g) => g.state.groupId === groupId);
    if (!group) throw new Error('Local group copy missing.');
    await this.withAuthority(async (c) => {
      const page = await localGroupViews(
        c.authority,
        groupId,
        older ? this.before : null,
      );
      guard();
      this.selected = { ...group, localOnly: true };
      this.views = page.views;
      this.historyPending = false;
      guard();
      this.before = page.before;
      this.warning = t(
        'Independent local copy. Sending and administration require verified current membership.',
      );
    }, guard);
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
    if (ids.length && this.visible() && document.visibilityState === 'visible')
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
      this.warning = t(
        'Messages opened. Personal vault full: the read could not be recorded.',
      );
    }
  }
  /** Delivery/read metadata for the open group's own messages, without
   * decoding history or reading the group directory. */
  async refreshReceipts(): Promise<void> {
    const selected = this.selected;
    if (!selected || selected.localOnly) return;
    const own = this.views
      .filter((v) => v.own && !v.localOnly)
      .map((v) => v.id);
    if (!own.length) return;
    const generation = this.generation,
      guard = this.selection.capture(() => this.guard(generation));
    const raw = await this.withAuthority(
      (c) =>
        c.api('group-daily-receipts', {
          groupId: selected.state.groupId,
          head: selected.head,
          ids: own,
        }),
      guard,
    );
    guard();
    if (this.selected === selected) this.applyReceipts(raw);
  }
  private applyReceipts(raw: unknown): void {
    if (!Array.isArray(raw) || raw.length > 16)
      throw new Error('Invalid group delivery checks.');
    for (const input of raw) {
      const d = object(input);
      if (typeof d['received'] !== 'boolean' || typeof d['read'] !== 'boolean')
        throw new Error('Invalid receipt.');
      const view = this.views.find((v) => v.id === uuid(d['id']));
      if (view) {
        view.delivery = d['received'] ? 'received' : 'accepted';
        view.read = d['read'];
      }
    }
  }
  async photo(
    group: GroupSummary | null = this.selected,
  ): Promise<GroupPhoto | null> {
    if (!group) return null;
    const current =
      this.entries.find(
        (entry) => entry.state.groupId === group.state.groupId,
      ) ??
      (this.selected?.state.groupId === group.state.groupId
        ? this.selected
        : null);
    if (!current) return null;
    return this.withLocalAuthority((authority) =>
      cachedGroupPhoto(authority, current),
    );
  }
  async updatePhoto(input: {
    group: string;
    id: string;
    photo: GroupPhoto | null;
  }): Promise<void> {
    if (this.selected?.state.groupId !== input.group || this.selected.localOnly)
      throw new Error('Open the connected group before changing its photo.');
    const photo = groupPhoto(input.photo);
    await this.identities.load();
    await this.authority.mutate(async (c) => {
      const group = await c.governance.verify(input.group);
      if (!groupManager(group.state, c.authority.session.accountId))
        throw new Error(
          'Only the owner or administrator can change the photo.',
        );
      await this.machine(c, (machine) =>
        publishGroupPhoto({
          ...c,
          group,
          machine,
          identities: this.identities,
          id: input.id,
          photo,
        }),
      );
    });
    await this.identities.save();
  }
  async description(): Promise<{ description: string; sequence: number }> {
    const selected = this.selected;
    if (!selected) return { description: '', sequence: 0 };
    return this.withLocalAuthority((authority) =>
      cachedGroupDescription(authority, selected),
    );
  }

  async updateDescription(input: {
    group: string;
    id: string;
    description: string;
    sequence: number;
  }): Promise<void> {
    if (this.selected?.state.groupId !== input.group || this.selected.localOnly)
      throw new Error('Open a connected group first.');
    const description = groupDescription(input.description);
    await this.identities.load();
    await this.authority.mutate(async (c) => {
      const group = await c.governance.verify(input.group);
      if (!groupManager(group.state, c.authority.session.accountId))
        throw new Error(
          'Only the owner or administrator can change the description.',
        );
      await this.machine(c, (machine) =>
        publishGroupProfile({
          ...c,
          group,
          machine,
          identities: this.identities,
          id: input.id,
          sequence: input.sequence,
          patch: { description },
        }),
      );
    });
    await this.identities.save();
  }
  async create(
    title: string,
    initial: { description?: string; photo?: GroupPhoto | null } = {},
  ): Promise<string> {
    const profile = creationProfile(title, initial);
    let created: string | null = null;
    this.warning = '';
    await this.identities.load();
    try {
      await this.authority.mutate(async (c) => {
        const catalog = new GroupCatalog(c.authority),
          pending = await catalog.creation();
        if (pending)
          assertCreationProfile(
            {
              version: 1,
              title: pending.title,
              description: pending.description,
              photo: pending.photo,
            },
            profile,
          );
        const event =
            pending?.event ??
            (await createGroupEvent(c.authority, crypto.randomUUID())),
          id = event.groupId;
        await catalog.saveCreation(event, profile);
        this.creationPending = true;
        await this.commit(c, event);
        created = id;
        await stageCreationProfile(c.authority, event, profile);
        this.creationPending = false;
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
      this.warning = t('Group created. Name or sync pending: {0}', [
        error instanceof Error
          ? translatedError(error.message)
          : t('resume when opening the group.'),
      ]);
    }
    if (created === null)
      throw new Error('Creation not confirmed. Resume the same request.');
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
    if (!selected) throw new Error('Open a group first.');
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
      throw new Error('Group change not confirmed.');
    await new GroupCache(c.authority, event.groupId).preserve(event);
  }
  async admission(
    action: 'add' | 'link' | 'revoke' | 'join',
    value = '',
  ): Promise<string | void> {
    await this.identities.load();
    const groupId = this.selected?.state.groupId;
    if (action !== 'join' && !groupId) throw new Error('Open a group first.');
    const result = await this.authority.mutate(async (c) => {
      const admission = new GroupAdmissions({
        ...c,
        identities: this.identities,
      });
      if (action === 'join') return admission.join(value);
      if (!groupId) throw new Error('Open a group first.');
      if (action === 'add') return admission.add(groupId, value);
      if (action === 'link') return admission.link(groupId);
      return admission.revoke(groupId);
    });
    await this.identities.save();
    return result;
  }
  async propose(target: string, kind: GroupConsent['kind']): Promise<void> {
    const selected = this.selected;
    if (!selected) throw new Error('Open a group first.');
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
      if (!current) throw new Error('Recipient identity missing.');
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
  /** Saves a text to that group's encrypted outbox, whichever group is open
   * when the save runs; sending still verifies the group first. */
  /** Stages a text in that group's encrypted outbox with this device's
   * verified local authority: no network read is needed to keep a draft, and
   * sending revalidates the group and its members online. The draft keeps its
   * queue ID and admission order. */
  async composeText(
    groupId: string,
    draft: { id: string; text: string; order: number },
  ): Promise<void> {
    await this.withLocalAuthority((authority) =>
      composeGroup({
        authority,
        groupId,
        text: draft.text,
        selection: null,
        id: draft.id,
        order: draft.order,
      }),
    );
  }
  async compose(
    text: string,
    selection: AttachmentSelection | null,
  ): Promise<void> {
    const selected = this.selected;
    if (!selected) throw new Error('Open a group first.');
    await this.withAuthority((c) =>
      composeGroup({
        authority: c.authority,
        groupId: selected.state.groupId,
        text,
        selection,
      }),
    );
  }
  async edit(view: GroupView, text: string): Promise<void> {
    if (
      this.selected?.state.groupId !== view.groupId ||
      !view.own ||
      view.kind !== 'text' ||
      view.localOnly ||
      this.historyPending
    )
      throw new Error('Only your own synced text messages can be edited.');
    await this.authority.mutate((c) =>
      composeGroup({
        authority: c.authority,
        groupId: view.groupId,
        text,
        selection: null,
        relation: {
          id: view.id,
          hash: view.hash,
          author: view.sender,
          type: 'edit',
        },
      }),
    );
    await this.sendPending();
  }
  async removeMessage(view: GroupView): Promise<void> {
    if (
      this.selected?.state.groupId !== view.groupId ||
      !view.own ||
      view.localOnly ||
      this.historyPending
    )
      throw new Error('Only your own synced messages can be deleted.');
    this.removed();
    try {
      await this.authority.mutate(async (c) => {
        const group = await c.governance.verify(view.groupId);
        await c.api('group-message-delete', {
          groupId: view.groupId,
          head: group.head,
          id: view.id,
          hash: view.hash,
          revision: c.authority.events.length,
        });
      });
    } catch (error: unknown) {
      this.hide();
      throw error;
    }
  }
  async sendPending(): Promise<void> {
    const selected = this.selected;
    if (!selected) return;
    this.retry.reset(selected.state.groupId);
    await this.sendSelectedPending(selected);
  }
  /** Sends one group's drafts whether or not it is still the open group. */
  async sendGroupDrafts(groupId: string): Promise<void> {
    const group =
      this.selected?.state.groupId === groupId
        ? this.selected
        : this.entries.find((entry) => entry.state.groupId === groupId);
    if (!group || group.localOnly) return;
    this.retry.reset(groupId);
    await this.sendSelectedPending(group);
  }
  async pendingWork(): Promise<boolean> {
    const selected = this.selected;
    return (
      !!selected &&
      !selected.localOnly &&
      navigator.onLine &&
      this.retry.available(selected.state.groupId) &&
      (await this.pending()).length > 0
    );
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
  /** A stale rejection is retried once with everything prepared again:
   * identities, group verification, participant directories and devices. */
  private async sendSelectedPending(selected: GroupSummary): Promise<void> {
    try {
      await this.sendPreparedPending(selected);
    } catch (error: unknown) {
      if (!staleGroupSend(error)) throw error;
      await this.sendPreparedPending(selected);
    }
  }
  private async sendPreparedPending(selected: GroupSummary): Promise<void> {
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
          text:
            d['kind'] === 'profile'
              ? t('Group update pending')
              : typeof d['text'] === 'string'
                ? d['text']
                : '',
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
    if (this.historyPending)
      throw new Error('Verify deletions before opening media.');
    const selected = this.selected;
    if (
      !selected ||
      !this.views.some((v) => v.id === view.id && v.hash === view.hash)
    )
      throw new Error('Group message changed.');
    const generation = this.generation;
    return this.withAuthority(async (c) => {
      if (selected.localOnly || !navigator.onLine)
        return this.localMedia(c.authority, view, thumbnail, generation);
      const group = await c.governance.verify(selected.state.groupId),
        content = attachmentContent(JSON.parse(view.text) as unknown),
        file = thumbnail ? content.thumbnail : content.file;
      if (!file) throw new Error('Preview unavailable.');
      await this.confirmMedia(c.api, group, view);
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
        await this.confirmMedia(c.api, group, view);
        return bytes;
      } catch (error: unknown) {
        bytes.fill(0);
        throw error;
      }
    });
  }
  private async confirmMedia(
    api: AttachmentApi,
    group: GroupState,
    view: GroupView,
  ): Promise<void> {
    if (
      this.historyPending ||
      (await api('group-message-available', {
        groupId: group.state.groupId,
        head: group.head,
        id: view.id,
        hash: view.hash,
      })) !== true
    )
      throw new Error(
        'The message was deleted or is unavailable for opening media.',
      );
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
    if (!file) throw new Error('Preview missing.');
    return downloadAttachment({
      account: groupCacheScope(authority.session.accountId, view.groupId),
      message: view.id,
      file,
      thumbnail,
      image: thumbnail || content.image,
      api: () =>
        Promise.reject(new Error('Media not preserved in this local copy.')),
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
      throw new Error('Group membership changed. Refresh it.');
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
    if (!selected) throw new Error('Open a group first.');
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
        throw new Error('Invalid cleanup notice.');
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
  /** Co-members of this group who accept requests by wallet; the server
   * checks membership, discovery and blocks. */
  async memberWallets(
    groupId: string,
    accounts: string[],
  ): Promise<MemberWallet[]> {
    return this.withAuthority(async (c) =>
      memberWalletPage(
        await c.api('group-member-wallets', { groupId, accounts }),
      ),
    );
  }
  async clearVault(): Promise<void> {
    const selected = this.selected;
    if (!selected) throw new Error('Open a group first.');
    await this.withAuthority(async (c) => {
      const group = await c.governance.verify(selected.state.groupId);
      await c.api('group-vault-clear', {
        groupId: group.state.groupId,
        head: group.head,
      });
    });
  }
}
