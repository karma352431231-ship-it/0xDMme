import {
  privateSendContext,
  privateSendBatch,
} from '../chat-sync-diagnostics/index.ts';
import type { PrivateSendContext } from '../chat-sync-diagnostics/index.ts';
import {
  measurePrivateSend,
  privateSendPoint,
} from '../chat-sync-diagnostics/index.ts';
import type { VaultWorkOptions } from '../vault-authority/index.ts';
import { loadingPresentation } from '../chat-sync-diagnostics/index.ts';
import {
  readPreparedGroupDirectory,
  readGroupSummary,
} from './directory-refresh.ts';
import type { GroupSummary } from './directory-refresh.ts';
export type { GroupSummary } from './directory-refresh.ts';
import {
  assertRemovalBatch,
  removeMessageBatch,
} from '../message-removal-batch/index.ts';
import type { MessageRemovalResult } from '../message-removal-batch/index.ts';
import { readMediaPreview, saveMediaPreview } from '../media-preview/index.ts';
import { MediaMemory } from '../media-memory/index.ts';
import type { MediaVariant } from '../media-memory/index.ts';
import { OwnRemovals, removalFailure } from '../own-removals/index.ts';
import type { MediaPreviews } from '../media-preview/index.ts';
import { networkAvailable } from '../connectivity/index.ts';
import {
  encodeGroupText,
  decodeGroupText,
} from '../../shared/group-messages/index.ts';
import type { ConversationPreview } from '../conversation-preview/index.ts';
import { GroupPreviews } from './previews.ts';
import { withSigner } from '../vault-authority/index.ts';
import { recoveryKey } from '../../shared/messages/index.ts';
import { validReaction, pinText } from '../../shared/daily/index.ts';
import { decryptViewOnce } from '../view-once/index.ts';
import type { ViewOnceMetadata } from '../view-once/index.ts';
import type { ViewOnceMediaBuffer } from '../view-once-media-buffer/index.ts';
import type { LoadTrace } from '../chat-sync-diagnostics/index.ts';
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
import type { IdentityPreparation } from '../peer-identity/index.ts';
import { PeerIdentity } from '../peer-identity/index.ts';
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
import { createGroupEvent, changeGroupEvent } from './transitions.ts';
import {
  composeGroup,
  composeGroupOnce,
  sendGroupPending,
  staleGroupSend,
} from './outbox.ts';
import type { GroupSendProgress } from './outbox.ts';
import { measureWork } from '../synchronization-diagnostics/index.ts';
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
import {
  HistoryFloors,
  WindowReceipts,
  historyPage,
  reachFloor,
} from '../history-window/index.ts';

interface GroupPrefetch {
  after: string | null;
  groups: GroupEvent[];
  before: number | null;
  listed: boolean;
  complete: boolean;
}
export class GroupController {
  private readonly directoryLoading = loadingPresentation('group-directory');
  private directoryProfiles: readonly string[] | null = null;
  private readonly directoryChanged: () => void;
  private focus: { group: string; sequence: number } | null = null;
  private readonly previews = new GroupPreviews({
    read: (group, guard) => this.readDirectoryPreview(group, guard),
    selected: () => this.selected?.state.groupId ?? null,
    changed: () => this.directoryChanged(),
    failed: (error) => {
      this.warning =
        error instanceof Error
          ? translatedError(error.message)
          : t('Could not complete the operation.');
    },
  });
  preview(group: string): ConversationPreview | undefined {
    return this.previews.get(group);
  }
  focusMessage(group: string, sequence: number): void {
    if (!Number.isSafeInteger(sequence) || sequence < 1)
      throw new Error('Invalid search page.');
    this.focus = { group, sequence };
  }
  get searchFocused(): boolean {
    return this.focus?.group === this.selected?.state.groupId;
  }
  latest(): void {
    this.focus = null;
  }
  private readonly retry = new GroupRetry();
  private readonly messageWindows = new GroupMessageWindows();
  historyPending = false;
  /** This tab's own deletions, hidden in place while the history stays shown. */
  private readonly ownRemovals = new OwnRemovals();
  /** Media opened in this session; see media-memory for its lifetime. */
  private readonly mediaMemory = new MediaMemory();
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
  /** How far back independent local copies reach; verified windows keep
   * their own floors in GroupMessageWindows. */
  private readonly localFloors = new HistoryFloors();
  private readonly receipts = {
    reads: new WindowReceipts<never>(),
    checks: new WindowReceipts<Pick<GroupView, 'delivery' | 'read'>>(
      (state) => state.read === true,
    ),
  };
  constructor(
    access: VaultAccess,
    sync: VaultSync,
    visible: () => boolean,
    directoryChanged = () => {},
  ) {
    this.directoryChanged = directoryChanged;
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
      this.focus = null;
      this.previews.clear();
      this.authority.invalidate();
      this.messageWindows.clear();
      this.localFloors.clear();
      this.receipts.reads.clear();
      this.receipts.checks.clear();
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
    this.focus = null;
  }
  close(): void {
    this.directoryLoading.reset();
    this.directoryProfiles = null;
    this.deselect();
    this.ownRemovals.clear();
    this.mediaMemory.clear();
    this.historyPending = false;
    this.pauseSynchronization();
    this.resetSynchronization();
    this.generation++;
  }
  /** Someone else's deletion: media of deleted messages must not linger. */
  removed(): void {
    this.mediaMemory.clear();
    this.selection.invalidate('removal');
    this.messageWindows.clear();
    this.pauseSynchronization();
    this.previews.clear();
    this.historyPending = true;
  }
  hide(): void {
    this.directoryLoading.reset();
    this.directoryProfiles = null;
    this.ownRemovals.clear();
    this.mediaMemory.clear();
    this.previews.clear();
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
    diagnostic: VaultWorkOptions = {},
  ): Promise<T> {
    const generation = this.generation;
    return this.authority.run(
      () => {
        this.guard(generation);
        selection?.();
      },
      work,
      diagnostic,
    );
  }
  private async machine<T>(
    c: GroupContext,
    work: (
      machine: import('../message-crypto/index.ts').MessageCrypto,
    ) => Promise<T>,
  ): Promise<T> {
    await measurePrivateSend(c.diagnostic, 'recovery', () =>
      ensureMessageRecovery(c.authority, c.api),
    );
    const machine = await measurePrivateSend(c.diagnostic, 'sdk-open', () =>
      openMessageMachine(c.authority, (op, data) => c.api(op, data)),
    );
    try {
      await measurePrivateSend(c.diagnostic, 'sdk-prepare', () =>
        machine.prepare(c.authority),
      );
      return await work(machine);
    } finally {
      machine.close();
    }
  }
  private async withLocalAuthority<T>(
    work: (authority: VaultAuthority) => Promise<T>,
    diagnostic?: PrivateSendContext,
  ): Promise<T> {
    const generation = this.generation;
    if (!this.session) throw new Error('Sign in and authorize this device.');
    return this.access.withVault(
      true,
      async (authority) => {
        this.guard(generation);
        if (authority.session.accountId !== this.session?.accountId)
          throw new Error('Account changed.');
        const result = await work(authority);
        this.guard(generation);
        return result;
      },
      { privateSend: diagnostic },
    );
  }
  async search(query: string, after: string | null) {
    if (this.historyPending && networkAvailable())
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
  directoryPresented(host: HTMLElement, matchingRows: boolean): void {
    this.directoryLoading.presented(host, matchingRows);
  }
  /** Publish verified rows before optional profile/outbox/history maintenance. */
  async refreshDirectory(
    more = false,
    preparation?: IdentityPreparation,
  ): Promise<void> {
    const generation = this.generation;
    try {
      await this.directoryLoading.run(async (trace) => {
        await this.loadDirectory(more, trace, preparation);
        this.guard(generation);
        return this.entries.length;
      });
    } catch (error: unknown) {
      if (generation === this.generation) this.directoryProfiles = null;
      throw error;
    } finally {
      preparation?.dispose();
    }
    this.guard(generation);
    this.previews.queue(this.entries);
  }
  private async loadDirectory(
    more: boolean,
    trace?: LoadTrace,
    preparation?: IdentityPreparation,
  ): Promise<void> {
    const generation = this.generation;
    this.directoryProfiles = null;
    if (!networkAvailable()) return this.refreshLocal(more);
    if (more && this.remoteNext === null) return this.refreshLocal(true, true);
    const diagnostic: VaultWorkOptions = {
      diagnosticOperation: 'group-identities',
      diagnosticLoad: trace?.token,
    };
    const data = await readPreparedGroupDirectory(
      {
        preparation,
        guard: () => this.guard(generation),
        identities: this.identities,
        after: more ? this.remoteNext : null,
        authority: (read) =>
          this.withAuthority(read, undefined, {
            ...diagnostic,
            diagnosticOperation: 'group-directory',
          }),
        trace,
        machine: (context, read) => this.machine(context, read),
      },
      diagnostic,
    );
    this.guard(generation);
    this.mode = 'configured';
    this.entries = more
      ? [
          ...this.entries,
          ...data.entries.filter(
            (entry) =>
              !this.entries.some(
                (old) => old.state.groupId === entry.state.groupId,
              ),
          ),
        ]
      : data.entries;
    this.directoryProfiles = data.entries.map((entry) => entry.state.groupId);
    this.remoteNext = data.next;
    // Read an existing bounded catalog page. Rebuilding the catalog from
    // history may scan many pages, so only the later maintenance imports it.
    await this.refreshLocal(more, true, more);
    this.guard(generation);
  }
  /** Optional work releases authority between groups. A newer directory page or
   * session supersedes the old cursor. Failed items stay pending for a retry. */
  async finishDirectoryRefresh(
    shouldYield: () => boolean = () => false,
  ): Promise<boolean> {
    if (!networkAvailable() || this.directoryProfiles === null) return true;
    const generation = this.generation;
    if (!this.historyLoaded) {
      await this.refreshLocal(false, true);
      this.guard(generation);
      this.directoryChanged();
    }
    if (!(await this.maintainDirectoryProfiles(generation, shouldYield)))
      return false;
    const finished = this.directoryProfiles;
    await this.reconcileSelected();
    this.guard(generation);
    await this.refreshIncoming();
    this.guard(generation);
    await this.identities.save(() => this.guard(generation));
    this.guard(generation);
    if (this.directoryProfiles === finished) this.directoryProfiles = null;
    return true;
  }
  private async maintainDirectoryProfiles(
    generation: number,
    shouldYield: () => boolean,
  ): Promise<boolean> {
    while (this.directoryProfiles?.length) {
      if (shouldYield()) return false;
      const remaining: readonly string[] = this.directoryProfiles;
      await this.withAuthority((context) =>
        this.maintainDirectoryGroup(context, remaining[0]!),
      );
      this.guard(generation);
      if (this.directoryProfiles !== remaining) return false;
      this.directoryProfiles = remaining.slice(1);
    }
    if (shouldYield()) return false;
    return true;
  }
  private async maintainDirectoryGroup(
    c: GroupContext,
    id: string,
  ): Promise<void> {
    const generation = this.generation;
    const group = await c.governance.verify(id);
    this.guard(generation);
    const staged = await stageCurrentProfile(c.authority, group);
    this.guard(generation);
    const pending = staged && this.retry.take(id);
    if (!pending && !(this.selected?.state.groupId === id && this.visible()))
      return;
    await this.machine(c, async (machine) => {
      if (pending)
        await sendGroupPending({
          ...c,
          group,
          machine,
          identities: this.identities,
        });
      if (pending || this.selected?.state.groupId === id) {
        const summary = await readGroupSummary({
          context: c,
          group,
          machine,
          identities: this.identities,
        });
        this.guard(generation);
        this.replaceVerifiedSummary(summary);
        if (pending) this.retry.reset(id);
      }
      if (this.selected?.state.groupId === id && this.visible())
        await this.openVerified(c, group, false, machine).catch(
          (error: unknown) => {
            if (!expectedInterruption(error)) throw error;
          },
        );
    });
  }
  private replaceVerifiedSummary(summary: GroupSummary): void {
    const id = summary.state.groupId;
    this.entries = this.entries.map((entry) =>
      entry.state.groupId === id ? summary : entry,
    );
    if (this.selected?.state.groupId === id) this.selected = summary;
  }
  private async reconcileSelected(): Promise<void> {
    const generation = this.generation;
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
      this.guard(generation);
      if (next) this.historyPending = true;
    } catch (error: unknown) {
      if (!(error instanceof AccountError) || error.status !== 403) throw error;
      this.guard(generation);
      this.selected = { ...selected, localOnly: true };
    }
    this.entries = this.entries.filter(
      (g) => g.state.groupId !== selected.state.groupId,
    );
    if (this.selected) this.entries.push(this.selected);
  }
  private async refreshLocal(
    more: boolean,
    combine = false,
    importHistory = true,
  ): Promise<void> {
    const generation = this.generation;
    if (!networkAvailable()) this.remoteNext = null;
    const result = await this.withLocalAuthority(async (authority) => {
      if (importHistory && !this.historyLoaded) {
        await importGroupCatalog(authority, () => this.guard(generation));
        this.guard(generation);
        this.historyLoaded = true;
      }
      const catalog = new GroupCatalog(authority);
      const creation = await catalog.creation();
      const page = await catalog.page(more ? this.localNext : null);
      return { ...page, creationPending: creation !== null };
    });
    const rows: GroupSummary[] = [];
    for (const item of result.items)
      rows.push({
        ...item,
        head: await groupEventHash(item.state),
        localOnly: true,
      });
    this.guard(generation);
    this.creationPending = result.creationPending;
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
    const generation = this.generation;
    const page = object(
      await this.withAuthority((c) =>
        c.api('group-incoming', { after: more ? this.incomingNext : null }),
      ),
    );
    this.guard(generation);
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
  async synchronizeAll(
    signal: AbortSignal,
    work: VaultWorkOptions = {},
  ): Promise<boolean> {
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
      const more = await this.access.withVault(
        false,
        async (authority) => {
          guard();
          if (authority.session.accountId !== this.session?.accountId)
            throw new Error('Account changed.');
          const api = (op: string, payload: Record<string, unknown>) =>
            messageApi(authority, op, payload, {
              guard,
              signal: combined,
              privateSend: work.privateSend,
            });
          if (!(await this.loadPrefetchGroups(progress, api))) return false;
          const governance = new GroupGovernance(
            this.identities,
            api,
            authority,
          );
          await this.prefetchGroupPage(
            { authority, api, governance, guard, diagnostic: work.privateSend },
            progress,
          );
          return true;
        },
        work,
      );
      privateSendPoint(work.privateSend, 'receipt-resource-release');
      guard();
      await measurePrivateSend(work.privateSend, 'receipt-persist', () =>
        this.identities.save(guard, work),
      );
      guard();
      if (more)
        privateSendPoint(work.privateSend, 'receipt-commit', {
          receiptPages: 1,
        });
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
    const group = await measurePrivateSend(c.diagnostic, 'receipt-verify', () =>
      c.governance.verify(progress.groups[0]!.groupId),
    );
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
    if (progress.before === null)
      this.rememberPreview(group.state.groupId, page.views);
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
    if (!networkAvailable() || localOnly) return this.openLocal(groupId, older);
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
      return this.openVerified(c, group, older);
    }, guard);
    guard();
    await this.identities.save(guard);
    guard();
    if (!complete)
      return new MessageContinuation(() => this.openSelected(input));
  }
  /** The latest window; `older` reaches one page further back. */
  private async openVerified(
    c: GroupContext,
    group: GroupState,
    older: boolean,
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
        this.focus?.group === group.state.groupId
          ? this.focus.sequence + 1
          : null,
        older,
      );
      guard();
      this.ownRemovals.settle(group.state.groupId, page.views);
      this.views = this.ownRemovals.visible(page.views);
      if (!this.searchFocused)
        this.rememberPreview(group.state.groupId, this.views);
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
  private rememberPreview(group: string, views: readonly GroupView[]): void {
    this.previews.publish(group, views);
  }
  /** One latest-window turn; complete indexes and relations remain mandatory.
   * Delivery processing is allowed, while read acknowledgement stays in open(). */
  private async readDirectoryPreview(summary: GroupSummary, guard: () => void) {
    const views = await this.withAuthority(async (c) => {
      guard();
      const group = await c.governance.verify(summary.state.groupId);
      if (group.head !== summary.head)
        throw new Error('The group list changed. Refresh it.');
      const lease = new GroupMessageLease({
        ...c,
        group,
        identities: this.identities,
      });
      try {
        const page = await this.messageWindows.latest({
          ...c,
          group,
          guard,
          identities: this.identities,
          indexPages: 1,
          read: (raw) => lease.read(raw),
        });
        guard();
        return page.views;
      } finally {
        lease.close();
      }
    }, guard);
    await this.identities.save(guard);
    guard();
    return views;
  }
  prepareDirectoryPreviews(): Promise<boolean> {
    return this.previews.step();
  }
  previewPresented(host: HTMLElement, groups: readonly string[]): void {
    this.previews.presented(host, groups);
  }
  private async openLocal(groupId: string, older: boolean): Promise<void> {
    this.selection.invalidate('replacement');
    const generation = this.generation,
      guard = this.selection.capture(() => this.guard(generation));
    const group = this.entries.find((g) => g.state.groupId === groupId);
    if (!group) throw new Error('Local group copy missing.');
    await this.withAuthority(async (c) => {
      const page = (before: number | null) =>
        localGroupViews(c.authority, groupId, before).then((p) => p.views);
      const reached = await reachFloor({
        rows: await page(null),
        floor: this.localFloors.floor(groupId),
        older,
        page,
        merge: (newer, older) =>
          [
            ...new Map([...older, ...newer].map((v) => [v.id, v])).values(),
          ].sort((a, b) => a.sequence - b.sequence),
      });
      guard();
      this.localFloors.update(groupId, reached);
      this.selected = { ...group, localOnly: true };
      this.views = reached.rows;
      this.historyPending = false;
      this.warning = t(
        'Independent local copy. Sending and administration require verified current membership.',
      );
    }, guard);
  }
  historyChanged(): void {
    this.historyLoaded = false;
  }
  /** False once the open group has nothing further back. */
  get olderAvailable(): boolean {
    const group = this.selected?.state.groupId;
    if (!group) return false;
    return this.selected?.localOnly
      ? !this.localFloors.complete(group) &&
          (this.localFloors.floor(group) !== null ||
            this.views.length >= historyPage)
      : this.messageWindows.olderAvailable(group, this.views);
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
      for (const batch of this.receipts.reads.batches(ids)) {
        if (!(await this.recordReads(api, group, batch))) break;
        this.receipts.reads.answered(batch);
      }
    await this.askReceipts((own) =>
      api('group-daily-receipts', { ...scope, ids: own }),
    );
  }
  /** False when the personal vault is full and the read was not recorded. */
  private async recordReads(
    api: AttachmentApi,
    group: GroupState,
    ids: string[],
  ): Promise<boolean> {
    try {
      await api('group-daily-read', {
        groupId: group.state.groupId,
        head: group.head,
        ids,
      });
      return true;
    } catch (error: unknown) {
      if (!(error instanceof AccountError) || error.status !== 413) throw error;
      await this.confirm(api, group);
      this.warning = t(
        'Messages opened. Personal vault full: the read could not be recorded.',
      );
      return false;
    }
  }
  /** Delivery/read metadata for the open group's own messages, without
   * decoding history or reading the group directory. */
  async refreshReceipts(): Promise<void> {
    const selected = this.selected;
    if (!selected || selected.localOnly) return;
    if (!this.views.some((v) => v.own && !v.localOnly)) return;
    const generation = this.generation,
      guard = this.selection.capture(() => this.guard(generation));
    await this.withAuthority(
      (c) =>
        this.askReceipts(async (ids) => {
          const raw = await c.api('group-daily-receipts', {
            groupId: selected.state.groupId,
            head: selected.head,
            ids,
          });
          guard();
          // A reopened group answers again on its own read.
          return this.selected?.state.groupId === selected.state.groupId
            ? raw
            : [];
        }),
      guard,
    );
  }
  /** The latest page of own messages on every check, older pages once. */
  private async askReceipts(
    request: (ids: string[]) => Promise<unknown>,
  ): Promise<void> {
    const own = this.views
      .filter((v) => v.own && !v.localOnly)
      .map((v) => v.id);
    for (const batch of this.receipts.checks.batches(own))
      this.receipts.checks.answered(
        batch,
        this.applyReceipts(await request(batch)),
      );
    for (const view of this.views) {
      const known = view.delivery
        ? undefined
        : this.receipts.checks.state(view.id);
      if (known) Object.assign(view, known);
    }
  }
  private applyReceipts(
    raw: unknown,
  ): Map<string, Pick<GroupView, 'delivery' | 'read'>> {
    if (!Array.isArray(raw) || raw.length > 16)
      throw new Error('Invalid group delivery checks.');
    const states = new Map<string, Pick<GroupView, 'delivery' | 'read'>>();
    for (const input of raw) {
      const d = object(input);
      if (typeof d['received'] !== 'boolean' || typeof d['read'] !== 'boolean')
        throw new Error('Invalid receipt.');
      const state = {
        delivery: d['received'] ? ('received' as const) : ('accepted' as const),
        read: d['read'],
      };
      states.set(uuid(d['id']), state);
      const view = this.views.find((v) => v.id === uuid(d['id']));
      if (view) Object.assign(view, state);
    }
    return states;
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
  /** 'transfer' here is the owner's direct handover to `target`. */
  async change(input: {
    kind: 'leave' | 'remove' | 'role' | 'transfer' | 'delete';
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
    await this.withLocalAuthority(
      (authority) =>
        composeGroup({
          authority,
          diagnostic: privateSendContext(draft.id),
          groupId,
          text: draft.text,
          contentFormat: 'daily',
          selection: null,
          id: draft.id,
          order: draft.order,
        }),
      privateSendContext(draft.id),
    );
  }
  async composeFor(
    groupId: string,
    text: string,
    selection: AttachmentSelection | null,
  ): Promise<void> {
    if (!this.entries.some((g) => g.state.groupId === groupId && !g.localOnly))
      throw new Error('Open a group first.');
    await this.withLocalAuthority((authority) =>
      composeGroup({
        authority,
        groupId,
        text,
        selection,
        contentFormat: 'daily',
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
      !!decodeGroupText(view.text).viewOnce ||
      this.historyPending
    )
      throw new Error('Only your own synced text messages can be edited.');
    await this.authority.mutate((c) =>
      composeGroup({
        authority: c.authority,
        groupId: view.groupId,
        text,
        contentFormat: 'daily',
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
  async react(view: GroupView, emoji: string, id: string): Promise<void> {
    if (
      !validReaction(emoji) ||
      view.localOnly ||
      this.historyPending ||
      this.selected?.state.groupId !== view.groupId
    )
      throw new Error('Group message is unavailable.');
    await this.authority.mutate((c) =>
      composeGroup({
        authority: c.authority,
        groupId: view.groupId,
        text: encodeGroupText({ text: emoji, reply: null, forwarded: false }),
        selection: null,
        id,
        relation: {
          id: view.id,
          hash: view.hash,
          author: view.sender,
          type: 'reaction',
        },
      }),
    );
    await this.sendPending();
  }
  /** Pins or unpins (until 0) a message for the whole group; the server
   * accepts it only from the owner and administrators. */
  async pin(view: GroupView, until: number): Promise<void> {
    const group = this.selected,
      account = this.session?.accountId;
    if (
      view.localOnly ||
      this.historyPending ||
      !group ||
      group.state.groupId !== view.groupId ||
      !account ||
      !groupManager(group.state, account)
    )
      throw new Error('Group message is unavailable.');
    await this.authority.mutate((c) =>
      composeGroup({
        authority: c.authority,
        groupId: view.groupId,
        text: encodeGroupText({
          text: pinText(until),
          reply: null,
          forwarded: false,
        }),
        selection: null,
        id: crypto.randomUUID(),
        relation: {
          id: view.id,
          hash: view.hash,
          author: view.sender,
          type: 'pin',
        },
      }),
    );
    await this.sendPending();
  }
  async stageMedia(input: {
    id: string;
    peer: string;
    text: string;
    reply: string | null;
    viewOnce: boolean;
    selection: AttachmentSelection | null;
    createdAt: number;
  }) {
    const diagnostic = privateSendContext(input.id);
    return this.withLocalAuthority(async (authority) => {
      if (input.viewOnce) {
        const ids = await composeGroupOnce({
          authority,
          diagnostic,
          groupId: input.peer,
          ...input,
        });
        return ids.map((id) => ({
          id,
          peer: input.peer,
          createdAt: input.createdAt,
          content: null,
        }));
      }
      const cache = new GroupCache(authority, input.peer, diagnostic),
        old = await cache.get(`outbox:${input.id}`);
      if (!old)
        await composeGroup({
          authority,
          diagnostic,
          groupId: input.peer,
          id: input.id,
          contentFormat: 'daily',
          text: encodeGroupText({
            text: input.text,
            reply: input.reply,
            forwarded: false,
          }),
          selection: input.selection,
          order: input.createdAt * 1000,
        });
      const draft = object(await cache.get(`outbox:${input.id}`));
      return [
        {
          id: input.id,
          peer: input.peer,
          createdAt: input.createdAt,
          content: attachmentContent(
            JSON.parse(String(draft['text'])) as unknown,
          ),
        },
      ];
    }, diagnostic);
  }
  async openViewOnce(
    view: GroupView,
    metadata: ViewOnceMetadata,
    signal: AbortSignal,
    work: {
      diagnostic?: LoadTrace | undefined;
      media?: ViewOnceMediaBuffer | undefined;
    },
  ) {
    const generation = this.generation;
    const guard = () => {
      this.guard(generation);
      signal.throwIfAborted();
      if (
        this.historyPending ||
        this.selected?.state.groupId !== view.groupId ||
        !this.views.some((v) => v.id === view.id && v.hash === view.hash)
      )
        throw new Error('Group message changed.');
    };
    const delivery = await withSigner(this.access, async (authority) => {
      guard();
      const input = {
        scope: 'group',
        peer: view.groupId,
        id: view.id,
        hash: metadata.hash,
      };
      const api = (op: string, data: Record<string, unknown>) =>
        messageApi(authority, op, data, { guard, signal });
      const status = object(await api('view-once-status', input));
      if (status['consumed'])
        throw new AccountError(
          410,
          'This view-once message was already opened.',
        );
      const recovery = recoveryKey(
        await api('recovery-key', { id: status['keyId'] }),
      );
      return { recovery, response: await api('view-once-open', input) };
    });
    guard();
    return this.access.withVault(false, async (authority) => {
      guard();
      return decryptViewOnce({
        authority,
        ...delivery,
        id: view.id,
        scope: 'group',
        group: view.groupId,
        peer: view.sender,
        metadata,
        ...work,
      });
    });
  }
  /** A bare removal notice may be this tab's own deletion coming back. */
  get expectingOwnRemoval(): boolean {
    return this.ownRemovals.expecting();
  }
  /** A verified read showed this deletion done, even if its reply was lost. */
  ownRemovalDone(id: string): boolean {
    return this.ownRemovals.done(id);
  }
  /**
   * Deletes one of the author's messages for everyone. The open history and
   * its verified windows stay; only this bubble leaves once the server
   * accepts (owner, 13/11/2026). The caller then runs the usual group read,
   * which verifies the removal through the group's change index.
   */
  async removeMessage(view: GroupView): Promise<void> {
    const results = await this.removeMessages([view]);
    const failure = results.find((result) => result.status === 'rejected');
    if (failure?.status === 'rejected') throw failure.reason;
  }
  /** Resolve governance once; every request retains its individual signed proof. */
  async removeMessages(
    views: readonly GroupView[],
  ): Promise<MessageRemovalResult[]> {
    assertRemovalBatch(views);
    for (const view of views) this.assertRemovable(view);
    const targets = views.filter((view) =>
      this.ownRemovals.begin(view.groupId, view.id),
    );
    if (!targets.length) return [];
    this.pauseSynchronization();
    const generation = this.generation;
    let accessLost: { reason: unknown } | null = null;
    let results: MessageRemovalResult[];
    try {
      results = await this.authority.mutate(async (c) => {
        const group = await c.governance.verify(targets[0]!.groupId);
        return removeMessageBatch(targets, async (view) => {
          if (accessLost) throw accessLost.reason;
          try {
            await c.api('group-message-delete', {
              groupId: view.groupId,
              head: group.head,
              id: view.id,
              hash: view.hash,
              revision: c.authority.events.length,
            });
          } catch (reason: unknown) {
            if (removalFailure(reason) === 'unauthorized' && !accessLost) {
              accessLost = { reason };
              this.hide();
            }
            throw reason;
          }
        });
      });
    } catch (reason: unknown) {
      results = targets.map(({ id }) => ({ id, status: 'rejected', reason }));
    }
    const accepted = new Set(
      results
        .filter((result) => result.status === 'fulfilled')
        .map((result) => result.id),
    );
    this.withdrawRemovals(targets.filter((view) => accepted.has(view.id)));
    for (const result of results) {
      if (result.status === 'rejected') {
        const failure = removalFailure(result.reason);
        this.ownRemovals.failed(result.id, failure === 'uncertain');
        if (failure === 'unauthorized' && generation === this.generation)
          this.hide();
      }
    }
    return results;
  }
  private assertRemovable(view: GroupView): void {
    if (
      this.selected?.state.groupId !== view.groupId ||
      !view.own ||
      view.localOnly ||
      this.historyPending
    )
      throw new Error('Only your own synced messages can be deleted.');
  }
  /** The accepted row leaves the open group's views; a late reply after
   * switching groups only marks it, for when that group is read again. */
  private withdrawRemovals(views: readonly GroupView[]): void {
    for (const view of views) {
      this.ownRemovals.accepted(view.id);
      this.mediaMemory.forget(view.id);
    }
    const groupId = views[0]?.groupId;
    if (!groupId || this.selected?.state.groupId !== groupId) return;
    this.views = this.ownRemovals.visible(this.views);
    if (!this.searchFocused) this.rememberPreview(groupId, this.views);
  }
  async sendPending(): Promise<void> {
    const selected = this.selected;
    if (!selected) return;
    this.retry.reset(selected.state.groupId);
    await this.sendSelectedPending(selected);
  }
  /** Sends one group's drafts whether or not it is still the open group. */
  async sendGroupDrafts(
    groupId: string,
    progress?: GroupSendProgress,
    diagnostic?: PrivateSendContext,
  ): Promise<void> {
    const group =
      this.selected?.state.groupId === groupId
        ? this.selected
        : this.entries.find((entry) => entry.state.groupId === groupId);
    if (!group || group.localOnly) return;
    this.retry.reset(groupId);
    await this.sendSelectedPending(group, progress, diagnostic);
  }
  async pendingWork(): Promise<boolean> {
    const selected = this.selected;
    return (
      !!selected &&
      !selected.localOnly &&
      networkAvailable() &&
      this.retry.available(selected.state.groupId) &&
      (await this.pending()).length > 0
    );
  }
  async resumePending(): Promise<boolean> {
    const selected = this.selected;
    if (!selected || selected.localOnly || !networkAvailable()) return false;
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
  private async sendSelectedPending(
    selected: GroupSummary,
    progress?: GroupSendProgress,
    diagnostic?: PrivateSendContext,
  ): Promise<void> {
    const batch = diagnostic ?? privateSendBatch();
    try {
      await this.sendPreparedPending(
        selected,
        progress,
        batch ? { ...batch, attempt: 1 } : undefined,
      );
    } catch (error: unknown) {
      if (!staleGroupSend(error)) throw error;
      await this.sendPreparedPending(
        selected,
        progress,
        batch ? { ...batch, attempt: 2 } : undefined,
      );
    }
  }
  private async sendPreparedPending(
    selected: GroupSummary,
    progress?: GroupSendProgress,
    diagnostic?: PrivateSendContext,
  ): Promise<void> {
    await measurePrivateSend(diagnostic, 'pins-load', () =>
      measureWork(this, 'group/identities', () =>
        this.identities.load({ privateSend: diagnostic }),
      ),
    );
    await this.withAuthority(
      async (c) => {
        const group = await measurePrivateSend(diagnostic, 'group-verify', () =>
          measureWork(this, 'group/verify', () =>
            c.governance.verify(selected.state.groupId),
          ),
        );
        await this.machine(c, (machine) =>
          sendGroupPending({
            ...c,
            group,
            machine,
            identities: this.identities,
            progress,
          }),
        );
      },
      undefined,
      { privateSend: diagnostic },
    );
    await measurePrivateSend(diagnostic, 'pins-save', () =>
      this.identities.save(undefined, { privateSend: diagnostic }),
    );
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
  async draftMedia(
    group: string,
    id: string,
    thumbnail: boolean,
  ): Promise<Uint8Array<ArrayBuffer>> {
    return this.withLocalAuthority(async (authority) => {
      const raw = object(
        await new GroupCache(authority, group).get(`outbox:${id}`),
      );
      const content = attachmentContent(
          JSON.parse(String(raw['text'])) as unknown,
        ),
        file = thumbnail ? content.thumbnail : content.file;
      if (!file) throw new Error('Attachment unavailable.');
      return downloadAttachment({
        account: groupCacheScope(authority.session.accountId, group),
        message: id,
        file,
        thumbnail,
        image: thumbnail || content.image,
        api: null,
        snapshot: undefined,
        guard: () => {},
      });
    });
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
    return this.mediaMemory.read(
      view.id,
      thumbnail ? 'thumbnail' : 'original',
      () => this.readMedia(selected, view, thumbnail),
    );
  }
  /** Whether this message's media was already opened in this session. */
  mediaReady(message: string, variant: MediaVariant): boolean {
    return this.mediaMemory.has(message, variant);
  }
  private readMedia(
    selected: GroupSummary,
    view: GroupView,
    thumbnail: boolean,
  ): Promise<Uint8Array<ArrayBuffer>> {
    const generation = this.generation;
    return this.withAuthority(async (c) => {
      if (selected.localOnly || !networkAvailable())
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
  mediaPreviews(view: GroupView): MediaPreviews {
    return {
      read: () =>
        this.withPreview(view, (authority, scope, file) =>
          readMediaPreview(authority, {
            scope,
            message: view.id,
            file,
            maximum: groupQuota,
            context: [view.groupId, view.epoch, view.hash],
          }),
        ),
      save: (bytes) =>
        this.withPreview(view, (authority, scope, file) =>
          saveMediaPreview(
            authority,
            {
              scope,
              message: view.id,
              file,
              maximum: groupQuota,
              context: [view.groupId, view.epoch, view.hash],
            },
            bytes,
          ),
        ),
    };
  }
  private async withPreview<T>(
    view: GroupView,
    work: (
      authority: VaultAuthority,
      scope: string,
      file: import('../../shared/attachments/index.ts').PrivateFile,
    ) => Promise<T>,
  ): Promise<T> {
    const selected = this.selected,
      generation = this.generation;
    const guard = () => {
      this.guard(generation);
      if (
        this.selected !== selected ||
        this.historyPending ||
        !this.views.some((row) => row.id === view.id && row.hash === view.hash)
      )
        throw new Error('Group message changed.');
    };
    guard();
    return this.withAuthority(async (c) => {
      guard();
      const group =
        selected!.localOnly || !networkAvailable()
          ? null
          : await c.governance.verify(view.groupId);
      if (group) await this.confirmMedia(c.api, group, view);
      const file = attachmentContent(JSON.parse(view.text) as unknown).file;
      const result = await work(
        c.authority,
        groupCacheScope(c.authority.session.accountId, view.groupId),
        file,
      );
      try {
        if (group) await this.confirmMedia(c.api, group, view);
        guard();
        return result;
      } catch (error: unknown) {
        if (result instanceof Uint8Array) result.fill(0);
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
