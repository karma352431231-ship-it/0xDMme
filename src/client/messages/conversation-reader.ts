import {
  SelectionWork,
  expectedInterruption,
  guardProjectionFailure,
} from '../synchronization-work/index.ts';
import { isSyncSnapshot } from '../../shared/message-sync/index.ts';
import type { MessageSyncSnapshot } from '../../shared/message-sync/index.ts';
import type { AccountSession } from '../../shared/account/index.ts';
import { object } from '../../shared/account/index.ts';
import {
  advancedElsewhere,
  StaleWindowReport,
  receiverOwnsAdvance,
  windowBehind,
} from './receiver-coverage.ts';
import { syncMessageApi as messageApi } from './sync-transport.ts';
import { readMessageWindow } from './window-read.ts';
import type { MessageReceiveTurn } from './receive-turn.ts';
import {
  MessageReadTarget,
  interruptedMessageRead,
  retainsMessageReadFence,
} from './read-target.ts';
import { MessageContinuation } from './continuation.ts';
import type { MessageWorkResult } from './continuation.ts';
import type { SyncReceiverPorts } from './sync-receiver.ts';
import { projectCachedConversation } from './cache-projection.ts';
import { ConfirmedConversations } from './confirmed-conversations.ts';
import {
  traceChatSync,
  traceChatSyncFailure,
} from '../chat-sync-diagnostics/index.ts';
import { probeConfirmed } from './confirmed-probe.ts';
import { readIncrementalWindow } from './incremental-window.ts';
import { readDelivery } from './delivery.ts';
import { optionalSentAt } from '../../shared/message-presentation/index.ts';
import {
  conversationHistory,
  relatedHistory,
  mergeHistory,
} from '../local-history/index.ts';
import type { BackupRecord } from '../backup-records/index.ts';
import { RemovalIndex } from '../personal-removals/index.ts';
import { localLocator } from '../vault-storage/index.ts';
import type {
  VaultAccess,
  VaultAuthority,
  VaultWorkOptions,
} from '../vault-authority/index.ts';
import { openLocal } from '../message-storage/index.ts';
import { indexSearch } from '../message-search/index.ts';
import { MessageVisibility } from '../message-visibility/index.ts';
import type { HistoryUpdate } from '../message-visibility/index.ts';
import { messageStates } from '../message-state/index.ts';
import {
  MessageIndex,
  IncompleteMessageIndex,
  VerifiedWindow,
  messagePeer,
} from './index-sync.ts';
import { OfflineIndex } from './offline-index.ts';
import { readPeerWindow } from './peer-window.ts';
import { messageItems } from './history.ts';
import type { Api, MessageItem } from './history.ts';
import type {
  MessageView,
  ConversationProjection,
  MessageReaderEvents,
} from './message-view.ts';

export interface MessageWindowRead {
  a: VaultAuthority;
  generation: number;
  api: Api;
  snapshot: unknown;
  items: MessageItem[];
  turn?: MessageReceiveTurn<MessageView>;
}
interface ReaderAuthority {
  session: () => Readonly<AccountSession> | null;
  current: () => number;
  guard: (generation: number) => void;
  savePins: (options?: VaultWorkOptions) => Promise<void>;
}
/** Packet operations retain cryptographic validation and encrypted persistence;
 * the reader owns selection, window verification and publication. */
interface ConversationPackets {
  cached: (
    a: VaultAuthority,
    snapshot: unknown,
    item: MessageItem,
  ) => Promise<MessageView | null>;
  missing: (read: MessageWindowRead) => Promise<Map<string, MessageView>>;
  remove: (
    read: {
      a: VaultAuthority;
      generation: number;
      selected: string | null;
      api?: Api;
    },
    item: MessageItem,
  ) => Promise<void>;
  offlineProfiles: (a: VaultAuthority, peer: string) => Promise<MessageView[]>;
}

/** Owns the selected verified window, staged publication and retained candidates.
 * Session invalidation remains authoritative in Messages; no raw state escapes. */
export class ConversationReader {
  private readonly access: VaultAccess;
  private readonly authority: ReaderAuthority;
  private readonly packets: ConversationPackets;
  private readonly visibility: MessageVisibility<MessageView>;
  private readonly selection = new SelectionWork();
  private selected: string | null = null;
  private before: number | null = null;
  private oldest: number | null = null;
  private confirmed: { snapshot: string; views: MessageView[] } | null = null;
  private readonly conversations = new ConfirmedConversations<MessageView>();
  private probedSnapshot: unknown = null;
  private readonly index = new MessageIndex();
  private readonly readTarget = new MessageReadTarget();
  private receiverCut: MessageSyncSnapshot | null = null;
  private readonly staleWindow = new StaleWindowReport();
  private readonly verified = new VerifiedWindow<MessageView>();
  private readonly offlineIndex = new OfflineIndex();
  private readonly verifiedProjection: (
    peer: string,
    views: MessageView[],
  ) => void;
  private readonly events: MessageReaderEvents;

  constructor(input: {
    access: VaultAccess;
    authority: ReaderAuthority;
    packets: ConversationPackets;
    publish: (
      rows: readonly MessageView[] | null,
      update: HistoryUpdate,
      projection: ConversationProjection,
    ) => void;
    events: MessageReaderEvents;
  }) {
    this.access = input.access;
    this.authority = input.authority;
    this.packets = input.packets;
    this.events = input.events;
    this.verifiedProjection = input.events.verified ?? (() => {});
    this.visibility = new MessageVisibility((rows, update) =>
      input.publish(rows, update, {
        peer: this.selected,
        latest: this.before === null,
      }),
    );
  }
  setProfile(session: AccountSession | null): void {
    this.conversations.setProfile(session);
  }
  close(): void {
    this.selection.invalidate('session');
    this.readTarget.reset();
    this.conversations.clear('controller-close');
    this.probedSnapshot = null;
    this.confirmed = null;
    this.receiverCut = null;
    this.staleWindow.clear();
    this.verified.clear();
    this.visibility.close();
    this.index.reset();
    this.offlineIndex.reset();
  }
  /** Navigation hides projection; account suspension also ends immediate reuse. */
  pause(scope: 'account' | 'conversation'): void {
    if (scope === 'account')
      this.conversations.invalidateReuse('account-pause');
    this.selection.invalidate(
      scope === 'account' ? 'authorization' : 'navigation',
    );
    this.probedSnapshot = null;
    this.visibility.close();
  }
  /** Block access now, retaining candidates only for an authenticated delta. */
  removed(): void {
    this.selection.invalidate('removal');
    this.conversations.hint();
    this.probedSnapshot = null;
    this.visibility.close('pending');
  }
  hide(): void {
    this.selection.invalidate('authorization');
    this.readTarget.reset();
    this.conversations.clear('hidden');
    this.probedSnapshot = null;
    this.index.reset();
    this.confirmed = null;
    this.verified.clear();
    this.visibility.close();
  }
  /** Retain the last complete view while requiring fresh confirmation. */
  hint(): void {
    this.probedSnapshot = null;
    this.conversations.hint();
    this.visibility.hint();
  }
  /** Append hints keep verified candidates reusable and invalidate staged work. */
  appended(): void {
    this.probedSnapshot = null;
    this.conversations.appended();
    this.visibility.hint();
  }
  setLiveConnected(connected: boolean): void {
    this.conversations.connection(connected);
  }
  get hintVersion(): number {
    return this.conversations.hintVersion;
  }
  invalidateReceiver(): void {
    this.readTarget.reset();
    this.confirmed = null;
    this.probedSnapshot = null;
    this.conversations.invalidateReuse('sync-failed');
    this.visibility.close('pending');
  }
  /** A content capability keeps the original candidate identity check local. */
  captureMedia(view: MessageView): {
    snapshot: () => unknown;
    guard: () => void;
  } {
    const confirmed = this.confirmed;
    return {
      snapshot: () =>
        confirmed ? (JSON.parse(confirmed.snapshot) as unknown) : null,
      guard: () => {
        if (
          navigator.onLine &&
          (this.confirmed !== confirmed ||
            !confirmed?.views.some(
              (row) => row.id === view.id && row.hash === view.hash,
            ))
        )
          throw new Error('Sync before opening the attachment.');
      },
    };
  }
  /** Search keeps its captured candidate, including existing archive semantics. */
  searchSnapshot(): () => string | null {
    const confirmed = this.confirmed;
    if (navigator.onLine && !confirmed)
      throw new Error('Sync before searching; history is hidden.');
    return () => confirmed?.snapshot ?? null;
  }
  /** Let the account receiver publish an append advance only when it owns it. */
  handOffAdvance(): boolean {
    if (
      !this.confirmed ||
      !receiverOwnsAdvance({
        window: this.confirmed.snapshot,
        probed: this.probedSnapshot,
        receiver: this.receiverCut,
      })
    )
      return false;
    this.probedSnapshot = null;
    return true;
  }
  canRestore(peer: string): boolean {
    return (
      this.authority.session() !== null &&
      this.conversations.reusable(peer) !== null
    );
  }
  /** Reproject only a verified window from this uninterrupted live session. */
  restoreSelected(): boolean {
    const candidate = this.selected
      ? this.conversations.reusable(this.selected)
      : null;
    if (!candidate || candidate !== this.confirmed) {
      traceChatSync(this.conversations, this.selected, {
        event: 'projection',
        reason: !this.selected
          ? 'no-selection'
          : candidate
            ? 'projection-mismatch'
            : 'window-unavailable',
      });
      return false;
    }
    const token = this.visibility.refresh();
    this.visibility.stage(token, candidate.views);
    this.visibility.complete(token);
    traceChatSync(this.conversations, this.selected, {
      event: 'projection',
      reason: 'restored',
    });
    return true;
  }
  select(peer: string | null, older = false): void {
    if (older || this.before !== null) this.readTarget.reset();
    this.selection.invalidate();
    this.probedSnapshot = null;
    const candidate = peer && !older ? this.conversations.read(peer) : null;
    traceChatSync(this.conversations, peer, {
      event: 'candidate-read',
      reason: candidate ? 'candidate-present' : 'missing',
      older,
    });
    this.confirmed = candidate;
    this.verified.clear();
    this.visibility.close();
    this.offlineIndex.reset();
    this.selected = peer;
    this.before = older ? this.oldest : null;
    if (candidate) this.oldest = candidate.oldest;
  }
  private concealChangedFence(token: number, snapshot: unknown): void {
    if (
      !this.confirmed ||
      retainsMessageReadFence(
        JSON.parse(this.confirmed.snapshot) as unknown,
        snapshot,
      )
    )
      return;
    this.conversations.invalidateReuse('snapshot-changed');
    this.visibility.conceal(token);
  }
  private rememberConversation(): void {
    if (this.confirmed)
      this.conversations.confirm(
        JSON.parse(this.confirmed.snapshot) as unknown,
      );
    if (!this.selected || this.before !== null || !this.confirmed) return;
    this.conversations.remember(this.selected, {
      ...this.confirmed,
      oldest: this.oldest,
    });
  }
  private confirmConversationChanges(snapshot: unknown): void {
    const changes = this.index.changesFor(snapshot);
    if (changes)
      this.conversations.advance(changes.from, changes.snapshot, changes.peers);
  }
  async synchronize(
    options: VaultWorkOptions = {},
  ): Promise<MessageWorkResult> {
    const probed = this.probedSnapshot;
    this.probedSnapshot = null;
    const token = this.visibility.refresh(),
      generation = this.authority.current(),
      selected = this.selected,
      guard = this.selection.capture(() => this.authority.guard(generation));
    try {
      const staged = await this.access.withVault(
        false,
        async (a) => {
          const api = (op: string, d: Record<string, unknown>) =>
              messageApi(a, op, d, () => guard()),
            snapshot = this.readTarget.take(
              probed ??
                (await api('snapshot', {
                  from: this.confirmed
                    ? (JSON.parse(this.confirmed.snapshot) as unknown)
                    : null,
                })),
            );
          this.concealChangedFence(token, snapshot);
          const incremental = await readIncrementalWindow({
            candidate: this.confirmed,
            snapshot,
            account: a.session.accountId,
            peer: selected,
            before: this.before,
            api,
            remove: (item) =>
              this.packets.remove({ a, generation, selected, api }, item),
            read: (items) =>
              this.readWindow({ a, generation, api, snapshot, items }),
            delivery: (views) =>
              this.refreshDelivery(snapshot, generation, views, a),
          });
          if (incremental)
            return { ...incremental, snapshot, account: a.session.accountId };
          const items = await this.synchronizeIndex({
            a,
            generation,
            api,
            snapshot,
            selected,
          });
          const related = messageItems(
            await api('relations', {
              ids: items.filter((i) => i.kind !== 'profile').map((i) => i.id),
              snapshot,
            }),
            48,
          ).items;
          const window = [...items, ...related];
          const ordered = await this.readWindow({
            a,
            generation,
            api,
            snapshot,
            items: window,
          });
          const delivered = await this.refreshDelivery(
            snapshot,
            generation,
            ordered,
            a,
          );
          const projected = await this.includeHistory(a, delivered, generation);
          return { views: projected, liveViews: ordered, snapshot, window };
        },
        options,
      );
      guard();
      await this.authority.savePins(options);
      guard();
      const views = staged.views;
      this.oldest =
        views.filter((v) => !v.relation && v.kind !== 'profile')[0]?.sequence ??
        this.before;
      this.visibility.stage(token, views);
      await this.confirmVisible(token, staged.snapshot, generation, options);
      guard();
      this.confirmed = { snapshot: JSON.stringify(staged.snapshot), views };
      if ('changes' in staged) {
        this.index.rememberChanges({
          ...staged,
          items: staged.changes,
          selected,
        });
        this.conversations.advance(staged.from, staged.snapshot, [
          ...new Set(
            staged.changes.map((item) => messagePeer(staged.account, item)),
          ),
        ]);
        this.verified.clear();
      } else
        this.verified.remember(
          staged.snapshot,
          staged.window,
          staged.liveViews,
        );
      this.confirmConversationChanges(staged.snapshot);
      this.rememberConversation();
      this.readTarget.reset();
    } catch (error: unknown) {
      guardProjectionFailure(error, guard, () => this.visibility.close());
      if (expectedInterruption(error)) throw error;

      if (error instanceof IncompleteMessageIndex) {
        guard();
        this.visibility.discard(token);
        return new MessageContinuation(async () => {
          guard();
          return this.synchronize(options);
        });
      }
      if (!interruptedMessageRead(error)) {
        this.index.reset();
        this.readTarget.reset();
      }
      this.conversations.clear('sync-failed');
      traceChatSyncFailure(this.conversations, {
        reason: 'sync-failed',
        current: generation === this.authority.current(),
        error,
      });
      this.probedSnapshot = null;
      this.confirmed = null;
      this.verified.clear();
      this.visibility.fail(token);
      throw error;
    }
  }
  /** Full, incremental and receiver reads share complete-window verification. */
  async readWindow(c: {
    a: VaultAuthority;
    generation: number;
    api: (operation: string, data: Record<string, unknown>) => Promise<unknown>;
    snapshot: unknown;
    items: MessageItem[];
    turn?: MessageReceiveTurn<MessageView>;
  }): Promise<MessageView[]> {
    return readMessageWindow({
      items: c.items,
      cached: async (item) =>
        c.turn
          ? c.turn.cachedView(item.id)
          : (this.verified.read(c.snapshot, item) ??
            (await this.packets.cached(c.a, c.snapshot, item))),
      missing: (items) => this.packets.missing({ ...c, items }),
      complete: (views) => indexSearch(c.a, views),
    });
  }
  private async confirmVisible(
    token: number,
    snapshot: unknown,
    generation: number,
    options: VaultWorkOptions = {},
  ): Promise<void> {
    const confirm = isSyncSnapshot(snapshot)
      ? this.visibility.confirmCut.bind(this.visibility)
      : this.visibility.confirm.bind(this.visibility);
    await confirm(token, async () => {
      const check = (a: VaultAuthority) =>
        messageApi(a, 'confirm', { snapshot }, () =>
          this.authority.guard(generation),
        );
      await this.access.withVault(false, check, options);
      this.authority.guard(generation);
    });
  }
  private historicalView(
    a: VaultAuthority,
    row: Extract<BackupRecord, { type: 'message' }>,
  ): MessageView {
    return {
      ...row,
      archived: true,
      author: row.own ? a.session.accountId : row.peer,
      state: messageStates.history,
    };
  }
  async openArchive(peer: string): Promise<void> {
    this.selected = peer;
    const generation = this.authority.current(),
      token = this.visibility.begin(),
      guard = this.selection.capture(() => this.authority.guard(generation));
    const open = async (a: VaultAuthority) => {
      const views = await this.includeHistory(a, [], generation);
      guard();
      this.oldest =
        views.filter((v) => !v.relation && v.kind !== 'profile')[0]?.sequence ??
        this.before;
      this.confirmed = { snapshot: 'local', views };
      this.visibility.stage(token, views);
      this.visibility.complete(token);
    };
    try {
      if (this.authority.session() && navigator.onLine)
        await this.access.withVault(false, open);
      else {
        const locator = await localLocator();
        if (!locator) throw new Error('Local history unavailable.');
        await this.access.withLocalVault(locator, open);
      }
    } catch (error: unknown) {
      this.visibility.fail(token);
      throw error;
    }
  }
  private async includeHistory(
    a: VaultAuthority,
    remote: readonly MessageView[],
    generation: number,
  ): Promise<MessageView[]> {
    const guard = this.selection.capture(() =>
      this.authority.guard(generation),
    );
    if (!this.selected) return [...remote];
    const local = await conversationHistory(a, this.selected, this.before);
    guard();
    const merged = mergeHistory(
      remote,
      local.map((r) => this.historicalView(a, r)),
    );
    const base = merged
      .filter((r) => !r.relation && r.kind !== 'profile')
      .slice(-16);
    const ids = new Set(base.map((r) => r.id));
    const related = await relatedHistory(a, [...ids], () => guard());
    const combined = mergeHistory(
      merged,
      related.map((r) => this.historicalView(a, r)),
    );
    return combined.filter(
      (r) =>
        r.kind === 'profile' ||
        ids.has(r.id) ||
        (r.relation && ids.has(r.relation.id)),
    );
  }
  private async synchronizeIndex(c: {
    a: VaultAuthority;
    generation: number;
    api: (op: string, d: Record<string, unknown>) => Promise<unknown>;
    snapshot: unknown;
    selected: string | null;
  }): Promise<MessageItem[]> {
    const read = {
      ...c,
      account: c.a.session.accountId,
      before: this.before,
      deleted: (item: MessageItem) => this.packets.remove(c, item),
    };
    const indexed = await this.index.completed(read);
    if (indexed) return indexed;
    // Finite cuts open one conversation without an account-wide scan; legacy
    // snapshots keep the complete index their deletion checks rely on.
    if (c.selected !== null && isSyncSnapshot(c.snapshot))
      return readPeerWindow({
        ...read,
        snapshot: c.snapshot,
        peer: c.selected,
      });
    return this.index.read({ ...read, pagesPerTurn: 1 });
  }
  /** A cut committed by another tab still needs this window's own projection. */
  observeDurableCut(durable: MessageSyncSnapshot | null): void {
    if (!durable) return;
    const elsewhere = advancedElsewhere(this.receiverCut, durable);
    if (!this.receiverCut || durable.revision > this.receiverCut.revision)
      this.receiverCut = durable;
    if (this.latestWindowBehind(durable)) this.reportStale(durable);
    if (elsewhere) this.events.elsewhere?.();
  }
  private reportStale(cut: MessageSyncSnapshot): void {
    if (this.selected && this.staleWindow.raise(this.selected, cut))
      this.events.stale?.();
  }
  private latestWindowBehind(cut: MessageSyncSnapshot): boolean {
    return (
      !!this.selected &&
      this.before === null &&
      !!this.confirmed &&
      windowBehind(this.confirmed.snapshot, cut)
    );
  }
  commitInboxBatch(
    batch: Parameters<SyncReceiverPorts<MessageView>['commit']>[0],
    hints: number,
  ): void {
    const catalog = {
      from: batch.from,
      snapshot: batch.snapshot,
      account: batch.snapshot.account,
      selected: this.selected,
      after: batch.after,
      page: batch.page,
    };
    if (batch.snapshot.source === 'journal')
      this.index.rememberJournalPage(catalog);
    else if (batch.snapshot.source === 'tail')
      this.index.rememberTailPage(catalog);
    else this.index.rememberConfirmedPage(catalog);
    const blocked = new Set(batch.pending.map((item) => item.peer));
    const covered = this.conversations.updateVerified({
      from: batch.from,
      snapshot: batch.snapshot,
      hints,
      complete: batch.complete,
      blocked,
      recovered: new Set(batch.recovered),
      publish: this.verifiedProjection,
      project: (peer, views) =>
        projectCachedConversation(
          views,
          batch.items.filter(
            (item) => messagePeer(batch.snapshot.account, item) === peer,
          ),
          batch.views.filter((view) => view.peer === peer),
        ),
    });
    if (batch.complete) this.receiverCut = batch.snapshot;
    this.events.receipt?.({
      account: batch.snapshot.account,
      journal: batch.snapshot.source === 'journal',
      items: batch.page.items,
      views: batch.views,
      covered,
    });
    if (
      !this.selected ||
      this.before !== null ||
      !batch.complete ||
      blocked.has(this.selected)
    )
      return;
    this.publishSelectedReceipt(batch.snapshot, covered.has(this.selected));
  }
  /** Only a complete covering commit may replace the selected latest window. */
  private publishSelectedReceipt(
    snapshot: MessageSyncSnapshot,
    covered: boolean,
  ): void {
    if (!covered) {
      if (this.confirmed && windowBehind(this.confirmed.snapshot, snapshot))
        this.reportStale(snapshot);
      return;
    }
    const candidate = this.selected
      ? this.conversations.read(this.selected)
      : null;
    if (!candidate) return;
    this.confirmed = candidate;
    this.verified.clear();
    const token = this.visibility.refresh();
    this.visibility.stage(token, candidate.views);
    this.visibility.complete(token, this.visibility.verificationVersion(token));
  }
  async probe(options: VaultWorkOptions = {}): Promise<boolean> {
    this.probedSnapshot = null;
    const token = this.visibility.refresh(
        this.confirmed ? 'delivery' : 'history',
      ),
      generation = this.authority.current(),
      guard = this.selection.capture(() => this.authority.guard(generation));
    try {
      return await this.access.withVault(
        false,
        async (authority) => {
          const api = (operation: string, payload: Record<string, unknown>) =>
            messageApi(authority, operation, payload, () => guard());
          let advanced: unknown = null;
          if (this.confirmed) {
            const views = await probeConfirmed({
              candidate: this.confirmed,
              advanced: (snapshot) => {
                advanced = snapshot;
              },
              api,
              visibility: this.visibility,
              token,
            });
            guard();
            if (views) {
              this.confirmed = { ...this.confirmed, views };
              this.rememberConversation();
              return false;
            }
          }
          const snapshot =
            advanced ??
            (await api('snapshot', {
              from: this.confirmed
                ? (JSON.parse(this.confirmed.snapshot) as unknown)
                : null,
            }));
          guard();
          this.concealChangedFence(token, snapshot);
          this.probedSnapshot = snapshot;
          this.visibility.discard(token);
          return true;
        },
        options,
      );
    } catch (error: unknown) {
      guardProjectionFailure(error, guard, () => this.visibility.close());
      if (expectedInterruption(error)) throw error;

      if (!interruptedMessageRead(error)) {
        this.index.reset();
        this.readTarget.reset();
      }
      this.conversations.clear('probe-failed');
      traceChatSyncFailure(this.conversations, {
        reason: 'probe-failed',
        current: generation === this.authority.current(),
        error,
      });
      this.probedSnapshot = null;
      this.confirmed = null;
      this.verified.clear();
      this.visibility.fail(token);
      throw error;
    }
  }
  private async refreshDelivery(
    snapshot: unknown,
    generation: number,
    views: readonly MessageView[],
    authority: VaultAuthority,
  ): Promise<MessageView[]> {
    return readDelivery({
      snapshot,
      views,
      api: (operation, payload) =>
        messageApi(authority, operation, payload, () =>
          this.authority.guard(generation),
        ),
    });
  }
  async openOffline(peer: string | null): Promise<void> {
    if (navigator.onLine)
      throw new Error('Connected: sync before opening history.');
    const token = this.visibility.begin(),
      generation = this.authority.current(),
      guard = this.selection.capture(() => this.authority.guard(generation)),
      locator = await localLocator();
    if (!locator) throw new Error('No authorized local copy on this device.');
    try {
      await this.access.withLocalVault(locator, async (a) => {
        const removed = new RemovalIndex();
        await removed.load(a, () => guard());
        const cached = await this.offlineIndex.read({
            account: a.session.accountId,
            peer,
            before: this.before,
            guard: () => guard(),
          }),
          views: MessageView[] = [];
        for (const value of cached) {
          guard();
          views.push({
            kind: value.kind ?? 'text',
            ...(value.relation ? { relation: value.relation } : {}),
            sequence: value.sequence,
            author: value.own ? a.session.accountId : value.peer,
            id: value.id,
            peer: value.peer,
            own: value.own,
            ...optionalSentAt(
              value.verification
                ? object(
                    JSON.parse(
                      await openLocal(a, value.verification),
                    ) as unknown,
                  )['sentAt']
                : undefined,
            ),
            text: await openLocal(a, value),
            hash: value.hash,
            state: messageStates.offline,
          });
        }
        if (peer) views.push(...(await this.packets.offlineProfiles(a, peer)));
        guard();
        this.selected = peer;
        const merged = await this.includeHistory(a, views, generation);
        this.oldest =
          merged.filter((v) => !v.relation && v.kind !== 'profile')[0]
            ?.sequence ?? this.before;
        guard();
        this.visibility.stage(token, merged);
        this.visibility.complete(token);
        this.offlineIndex.reset();
      });
    } catch (error: unknown) {
      this.visibility.fail(token);
      throw error;
    }
  }
}
