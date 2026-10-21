import { ApiResponseError } from '../api-response/index.ts';
import { messagePageSize } from '../../shared/messages/index.ts';
import { AccountError } from '../../shared/account/index.ts';
import { canonical } from '../../shared/devices/index.ts';
import {
  sameSyncFence,
  syncSnapshot,
} from '../../shared/message-sync/index.ts';
import type { MessageSyncSnapshot } from '../../shared/message-sync/index.ts';
import { MessageStorageError } from '../message-storage/index.ts';
import { messageItems } from './history.ts';
import type { Api, MessageItem } from './history.ts';
import { assertMessagePage, messagePeer } from './index-sync.ts';
import { readMessageDelta } from './delta.ts';
import type { SyncProgress, PendingConversation } from './sync-progress.ts';

interface View {
  id: string;
  peer: string;
  state: string;
}
export interface SyncReceiverPorts<T extends View> {
  account: string;
  device: string;
  wakeRecovery?: boolean;
  failureReason?: (error: unknown) => 'key' | 'verification';
  invalidate?: () => void;
  status?: (pending: PendingConversation[]) => void;
  api: Api;
  guard: () => void;
  load: () => Promise<SyncProgress>;
  save: (state: SyncProgress) => Promise<void>;
  prepare?: (
    snapshot: MessageSyncSnapshot,
    items: MessageItem[],
  ) => Promise<number>;
  finish?: () => Promise<void>;
  remove: (item: MessageItem) => Promise<void>;
  read: (snapshot: MessageSyncSnapshot, items: MessageItem[]) => Promise<T[]>;
  commit: (batch: {
    snapshot: MessageSyncSnapshot;
    from: MessageSyncSnapshot | null;
    items: MessageItem[];
    views: T[];
    complete: boolean;
    after: number;
    next: number | null;
    page: { items: MessageItem[]; next: number | null };
    pending: PendingConversation[];
    recovered: string[];
  }) => void;
  suspendedState: string;
}

/** One bounded account page, independent per-peer application, durable recovery
 * ranges instead of an unbounded failed-packet queue. Network/SDK ownership is
 * supplied by the caller and never overlaps another receiver turn. */
export class MessageSyncReceiver {
  async step<T extends View>(p: SyncReceiverPorts<T>): Promise<boolean> {
    const state = await p.load();
    p.guard();
    p.status?.(state.pending);
    if (p.wakeRecovery)
      for (const pending of state.pending) pending.retryAt = 0;
    try {
      return await this.consume(p, state);
    } catch (error: unknown) {
      p.guard();
      if (securityFailure(error)) p.invalidate?.();
      if (error instanceof AccountError && error.status === 409) {
        state.target = null;
        state.after = 0;
        for (const pending of state.pending) pending.after = 0;
        await p.save(state);
      }
      throw error;
    }
  }
  private async consume<T extends View>(
    p: SyncReceiverPorts<T>,
    state: SyncProgress,
  ): Promise<boolean> {
    const from = state.discovered;
    const source = await this.source(p, state, discoveryLimit(state));
    const page = source.page;
    if (
      source.idle &&
      !state.pending.some((item) => item.retryAt <= Date.now())
    )
      return false;
    for (const item of page.items) {
      messagePeer(p.account, item);
      if (item.deleted) await verifiedRemoval(p, item);
    }
    const after = state.after;
    const views = await this.apply(p, state, source.snapshot, page.items);
    const recovered = await this.recover(
      p,
      state,
      source.snapshot,
      messagePageSize - page.items.length,
    );
    views.push(...recovered.views);
    p.guard();
    await p.finish?.();
    await p.api('confirm', { snapshot: source.snapshot });
    p.guard();
    confirmProgress(state, source.snapshot, page);
    await p.save(state);
    p.guard();
    const items = [
      ...new Map(
        [...page.items, ...recovered.items].map((item) => [item.id, item]),
      ).values(),
    ];
    p.commit({
      snapshot: source.snapshot,
      from,
      items,
      views,
      complete: page.next === null,
      pending: state.pending.map((item) => ({ ...item })),
      after,
      next: page.next,
      page,
      recovered: recovered.peers,
    });
    return (
      page.next !== null ||
      state.pending.some((item) => item.retryAt <= Date.now()) ||
      source.changed
    );
  }
  private async source<T extends View>(
    p: SyncReceiverPorts<T>,
    state: SyncProgress,
    limit: number,
  ) {
    const snapshot = await readTarget(p, state);
    assertScope(snapshot, p);
    const changed = checkpointChanged(state.discovered, snapshot);
    if (!state.target && !changed)
      return { snapshot, page: { items: [], next: null }, changed, idle: true };
    initializeTarget(state, snapshot);
    if (snapshot.source === 'journal' && state.discovered) {
      const items = await readMessageDelta(p.api, state.discovered, snapshot);
      if (items !== null)
        return {
          snapshot,
          page: boundedPage(
            journalPage(items, state.after, snapshot.anchor),
            limit,
          ),
          changed,
          idle: false,
        };
      snapshot.source = sameSyncFence(state.discovered, snapshot)
        ? 'tail'
        : 'full';
      snapshot.recovery =
        snapshot.source === 'tail' ? 'expired' : 'invalidation';
      state.after = snapshot.source === 'tail' ? state.discovered.anchor : 0;
    }
    const page = messageItems(
      await p.api('page', { snapshot, after: state.after }),
    );
    assertMessagePage(page, state.after);
    if (page.items.some((item) => item.sequence > snapshot.anchor))
      throw new Error('Message page exceeds its confirmed cut.');
    return { snapshot, page: boundedPage(page, limit), changed, idle: false };
  }
  private async apply<T extends View>(
    p: SyncReceiverPorts<T>,
    state: SyncProgress,
    snapshot: MessageSyncSnapshot,
    items: MessageItem[],
  ): Promise<T[]> {
    const live = readableItems(state, snapshot, items, p.account);
    const views: T[] = [];
    for (let offset = 0; offset < live.length;) {
      const window = live.slice(offset, offset + 32);
      const count = (await p.prepare?.(snapshot, window)) ?? window.length;
      if (!Number.isInteger(count) || count < 1 || count > window.length)
        throw new Error('Receive batch made no bounded progress.');
      views.push(
        ...(await this.applyWindow(p, state, {
          snapshot,
          items: window.slice(0, count),
        })),
      );
      offset += count;
    }
    return views;
  }
  private async applyWindow<T extends View>(
    p: SyncReceiverPorts<T>,
    state: SyncProgress,
    batch: { snapshot: MessageSyncSnapshot; items: MessageItem[] },
  ): Promise<T[]> {
    const groups = new Map<string, MessageItem[]>();
    for (const item of batch.items) {
      const peer = messagePeer(p.account, item);
      groups.set(peer, [...(groups.get(peer) ?? []), item]);
    }
    const views: T[] = [];
    for (const [peer, rows] of groups) {
      const pending = state.pending.find((item) => item.peer === peer);
      if (pending) {
        pending.required = Math.max(pending.required, batch.snapshot.anchor);
        continue;
      }
      try {
        const opened = await p.read(batch.snapshot, rows);
        assertOpened(rows, opened, p.account);
        p.guard();
        if (opened.some((view) => view.state === p.suspendedState)) {
          this.defer(state, peer, batch.snapshot, 'consent');
          continue;
        }
        views.push(...opened);
      } catch (error: unknown) {
        p.guard();
        if (globalFailure(error)) throw error;
        this.defer(
          state,
          peer,
          batch.snapshot,
          p.failureReason?.(error) ?? 'verification',
        );
      }
    }
    return views;
  }
  private async recover<T extends View>(
    p: SyncReceiverPorts<T>,
    state: SyncProgress,
    snapshot: MessageSyncSnapshot,
    limit: number,
  ): Promise<{ views: T[]; items: MessageItem[]; peers: string[] }> {
    if (limit < 1) return { views: [], items: [], peers: [] };
    const pending = state.pending.find((item) => item.retryAt <= Date.now());
    if (!pending) return { views: [], items: [], peers: [] };
    state.pending = [
      ...state.pending.filter((item) => item !== pending),
      pending,
    ];
    try {
      const page = await this.recoveryPage(p, snapshot, pending, limit);
      const items = page.items.filter((item) => !item.deleted);
      const views = await this.readRecovery(p, snapshot, items);
      assertOpened(items, views, p.account);
      p.guard();
      if (views.some((view) => view.state === p.suspendedState))
        throw new Error('Message consent remains suspended.');
      pending.after = pageAfter(page, pending.after);
      pending.retryAt = 0;
      if (page.next === null) finishRecovery(state, pending);
      return {
        views,
        items: page.items,
        peers: state.pending.includes(pending) ? [] : [pending.peer],
      };
    } catch (error: unknown) {
      p.guard();
      if (globalFailure(error)) throw error;
      pending.retryAt = Date.now() + 30000;
      return { views: [], items: [], peers: [] };
    }
  }
  private async recoveryPage<T extends View>(
    p: SyncReceiverPorts<T>,
    snapshot: MessageSyncSnapshot,
    pending: PendingConversation,
    limit: number,
  ) {
    const raw = await p.api('sync-peer-page', {
      snapshot,
      peer: pending.peer,
      after: pending.after,
      through: pending.through,
    });
    p.guard();
    try {
      const page = messageItems(raw);
      assertMessagePage(page, pending.after);
      for (const item of page.items) {
        if (
          messagePeer(p.account, item) !== pending.peer ||
          item.sequence > pending.through
        )
          throw new UnsafeDeletion(
            new Error('Recovery page belongs to another conversation.'),
          );
        if (item.deleted) {
          await p.remove(item);
        }
      }
      return boundedPage(page, limit);
    } catch (error: unknown) {
      throw new UnsafeDeletion(error);
    }
  }
  private async readRecovery<T extends View>(
    p: SyncReceiverPorts<T>,
    snapshot: MessageSyncSnapshot,
    items: MessageItem[],
  ): Promise<T[]> {
    const views: T[] = [];
    for (let offset = 0; offset < items.length;) {
      const remaining = items.slice(offset);
      const count =
        (await p.prepare?.(snapshot, remaining)) ?? remaining.length;
      if (count < 1 || count > remaining.length)
        throw new Error('Invalid recovery batch.');
      views.push(...(await p.read(snapshot, remaining.slice(0, count))));
      offset += count;
    }
    return views;
  }
  private defer(
    state: SyncProgress,
    peer: string,
    snapshot: MessageSyncSnapshot,
    reason: PendingConversation['reason'],
  ): void {
    if (state.pending.length >= 4096)
      throw new MessageStorageError(
        'Message recovery obligations exceed the device budget.',
      );
    state.pending.push({
      peer,
      after: 0,
      through: snapshot.anchor,
      required: snapshot.anchor,
      reason,
      retryAt: Date.now() + 30000,
    });
  }
}
class UnsafeDeletion extends Error {
  constructor(cause: unknown) {
    super('Message deletion verification failed.', { cause });
  }
}
function globalFailure(error: unknown): boolean {
  return (
    error instanceof UnsafeDeletion ||
    error instanceof ApiResponseError ||
    error instanceof MessageStorageError ||
    (error instanceof AccountError && [401, 403, 409].includes(error.status))
  );
}

function assertOpened<T extends View>(
  items: MessageItem[],
  views: T[],
  account: string,
): void {
  if (
    views.length !== items.length ||
    new Set(views.map((view) => view.id)).size !== items.length ||
    items.some(
      (item) =>
        !views.some(
          (view) =>
            view.id === item.id && view.peer === messagePeer(account, item),
        ),
    )
  )
    throw new Error('Receive results do not cover the complete packet group.');
}

function checkpointChanged(
  from: MessageSyncSnapshot | null,
  snapshot: MessageSyncSnapshot,
): boolean {
  return (
    !from ||
    canonical([
      from.revision,
      from.anchor,
      from.invalidation,
      from.contacts,
      from.directory,
    ]) !==
      canonical([
        snapshot.revision,
        snapshot.anchor,
        snapshot.invalidation,
        snapshot.contacts,
        snapshot.directory,
      ])
  );
}
function initializeTarget(
  state: SyncProgress,
  snapshot: MessageSyncSnapshot,
): void {
  if (state.target) return;
  if (state.discovered && !sameSyncFence(state.discovered, snapshot))
    for (const pending of state.pending) pending.after = 0;
  state.target = snapshot;
  state.after =
    snapshot.source === 'tail' ? (state.discovered?.anchor ?? 0) : 0;
}
function confirmProgress(
  state: SyncProgress,
  snapshot: MessageSyncSnapshot,
  page: { items: MessageItem[]; next: number | null },
): void {
  state.after = page.next ?? page.items.at(-1)?.sequence ?? state.after;
  if (page.next === null) {
    state.discovered = snapshot;
    state.target = null;
    state.after = 0;
  }
  if (state.pending.length === 0) state.applied = state.discovered;
}

function finishRecovery(
  state: SyncProgress,
  pending: PendingConversation,
): void {
  if (pending.required > pending.through) {
    pending.after = pending.through;
    pending.through = pending.required;
  } else state.pending = state.pending.filter((item) => item !== pending);
}

function assertScope(
  snapshot: MessageSyncSnapshot,
  scope: { account: string; device: string },
): void {
  if (snapshot.account !== scope.account || snapshot.device !== scope.device)
    throw new Error('Message cut belongs to another device.');
}

function securityFailure(error: unknown): boolean {
  return (
    error instanceof UnsafeDeletion ||
    (error instanceof AccountError && [401, 403, 409].includes(error.status))
  );
}
function readableItems(
  state: SyncProgress,
  snapshot: MessageSyncSnapshot,
  items: MessageItem[],
  account: string,
): MessageItem[] {
  return items.filter((item) => {
    if (item.deleted) return false;
    const pending = state.pending.find(
      (row) => row.peer === messagePeer(account, item),
    );
    if (!pending) return true;
    pending.required = Math.max(pending.required, snapshot.anchor);
    return false;
  });
}

async function verifiedRemoval<T extends View>(
  p: SyncReceiverPorts<T>,
  item: MessageItem,
): Promise<void> {
  try {
    await p.remove(item);
  } catch (error: unknown) {
    throw new UnsafeDeletion(error);
  }
}

function journalPage(
  items: MessageItem[],
  after: number,
  anchor: number,
): { items: MessageItem[]; next: number | null } {
  assertMessagePage({ items, next: null }, 0);
  if (items.some((item) => item.sequence > anchor))
    throw new Error('Message changes exceed their confirmed cut.');
  const remaining = items.filter((item) => item.sequence > after),
    page = remaining.slice(0, messagePageSize);
  return {
    items: page,
    next: remaining.length > messagePageSize ? page.at(-1)!.sequence : null,
  };
}

function discoveryLimit(state: SyncProgress): number {
  return state.pending.some((item) => item.retryAt <= Date.now())
    ? messagePageSize / 2
    : messagePageSize;
}
function boundedPage(
  page: { items: MessageItem[]; next: number | null },
  limit: number,
): { items: MessageItem[]; next: number | null } {
  if (page.items.length <= limit) return page;
  const items = page.items.slice(0, limit);
  return { items, next: items.at(-1)!.sequence };
}

async function readTarget<T extends View>(
  p: SyncReceiverPorts<T>,
  state: SyncProgress,
): Promise<MessageSyncSnapshot> {
  return (
    state.target ??
    syncSnapshot(await p.api('snapshot', { from: state.discovered }))
  );
}
function pageAfter(
  page: { items: MessageItem[]; next: number | null },
  previous: number,
): number {
  return page.next ?? page.items.at(-1)?.sequence ?? previous;
}
