import { MessageSynchronization } from '../../src/client/messages/synchronization.ts';
import { ConnectedConversationVisits } from '../../src/client/messages/visits.ts';
import { AuthorityWork } from '../../src/client/devices/authority-work.ts';
import { GroupMessageWindows } from '../../src/client/groups/message-windows.ts';
import { IncompleteGroupIndex } from '../../src/client/groups/message-index.ts';
import type { GroupView } from '../../src/client/groups/reader.ts';
import type { GroupEvent } from '../../src/shared/groups/index.ts';

const delay = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const noop = () => Promise.resolve();
/** Same synthetic transport/CPU load for baseline and candidate source bundles.
 * Measures the assembled scheduler/reader, not real-device crypto/network speed. */
export async function runConversationLoad(paint: (text: string) => void) {
  const queue = new AuthorityWork(),
    windows = new GroupMessageWindows();
  const accountId = crypto.randomUUID(),
    groupId = crypto.randomUUID(),
    head = 'a'.repeat(64);
  const state: GroupEvent = {
    version: 1,
    groupId,
    revision: 1,
    epoch: 1,
    previous: null,
    kind: 'create',
    actor: accountId,
    deviceId: crypto.randomUUID(),
    directory: head,
    authorityRevision: 1,
    owner: accountId,
    members: [{ accountId, role: 'owner', joined: 1 }],
    target: null,
    consent: null,
    signature: 'A'.repeat(86) + '==',
  };
  const views: GroupView[] = Array.from({ length: 192 }, (_, n) => ({
    id: crypto.randomUUID(),
    groupId,
    sequence: n + 1,
    epoch: 1,
    hash: head,
    sender: accountId,
    own: true,
    kind: 'text',
    text: 'Synthetic',
    unavailableMedia: [],
  }));
  const metrics = {
    clickMs: [] as number[],
    receiptMs: [] as number[],
    displayMs: [] as number[],
    exclusiveWaitMs: [] as number[],
    exclusiveRunMs: [] as number[],
    schedulerRunMs: [] as number[],
    pages: [] as number[],
    cancellations: 0,
    longTasks: [] as number[],
    longTaskSupported: false,
    maximumOwners: 0,
    received: 0,
    accepted: 0,
    sendToReceiptMs: null as number | null,
    sendToDisplayMs: null as number | null,
  };
  const pending: number[] = [],
    navigation: Promise<void>[] = [];
  let active = 0,
    complete = false,
    selected = 'A',
    sendAt = 0;
  const lease = <T>(operation: () => Promise<T>, priority?: 'interactive') => {
    const queued = performance.now();
    return queue.run(async () => {
      const start = performance.now();
      metrics.exclusiveWaitMs.push(start - queued);
      active++;
      metrics.maximumOwners = Math.max(metrics.maximumOwners, active);
      try {
        return await operation();
      } finally {
        active--;
        metrics.exclusiveRunMs.push(performance.now() - start);
      }
    }, priority);
  };
  const sync = new MessageSynchronization({
    state: () => ({
      generation: 0,
      connected: true,
      session: true,
      online: true,
      visible: true,
      suspended: false,
      liveConnecting: false,
      startupPending: true,
    }),
    status() {},
    notice: () => {
      metrics.cancellations++;
    },
    complete() {},
    renderPending: noop,
    pause() {},
    preloadDirect: () => Promise.resolve(false),
    preloadGroups: () => Promise.resolve(false),
    unread: noop,
    presence: noop,
    refresh: noop,
    changes: noop,
    changeMaintenance: [noop, noop, noop],
    periodic: noop,
    periodicWork: () => Promise.resolve(false),
    pending: () => Promise.resolve([]),
    sendPending: noop,
  });
  const visits = new ConnectedConversationVisits<string>({
    connected: () => true,
    available: () => sync.presentationReady ?? sync.foregroundReady,
    backgroundReady: () => false,
    reusable: () => true,
    select: (peer) => {
      selected = peer;
    },
    restore: () => {
      paint(selected);
      return true;
    },
    background: noop,
    check: noop,
    failed: () => {
      metrics.cancellations++;
    },
  });
  const select = () => {
    const click = performance.now(),
      peer = ['A', 'B', 'C'][metrics.pages.length % 3]!;
    navigation.push(
      sync.open(noop, () => {
        if (!visits.open(peer)) return false;
        metrics.clickMs.push(performance.now() - click);
        return true;
      }),
    );
  };
  const send: { work: Promise<boolean> | null } = { work: null };
  const submit = () => {
    if (send.work) return;
    sendAt = performance.now();
    send.work = sync.run(() =>
      lease(() => {
        pending.push(sendAt);
        metrics.accepted++;
        return Promise.resolve();
      }, 'interactive'),
    );
  };
  const observer =
    typeof PerformanceObserver !== 'undefined' &&
    PerformanceObserver.supportedEntryTypes.includes('longtask')
      ? new PerformanceObserver((list) =>
          metrics.longTasks.push(
            ...list.getEntries().map((entry) => entry.duration),
          ),
        )
      : null;
  metrics.longTaskSupported = observer !== null;
  observer?.observe({ type: 'longtask' });
  const context = {
    authority: {
      session: { accountId, deviceId: state.deviceId, csrf: 'synthetic' },
      directory: head,
      offline: false,
      epoch: 1,
      events: [],
      key: () => Promise.reject(new Error('Synthetic')),
      sign: () => Promise.resolve('synthetic'),
    },
    group: { state, head },
    identities: {} as Parameters<GroupMessageWindows['read']>[0]['identities'],
    indexPages: 1,
    api: async (operation: string, data: Record<string, unknown>) => {
      if (operation === 'group-message-snapshot')
        return { groupId, head, directory: head, revision: 1 };
      if (operation === 'group-message-index') {
        metrics.pages.push(Number(data['after']));
        pending.push(performance.now());
        metrics.accepted++;
        select();
        submit();
        await delay();
        const start = performance.now();
        while (performance.now() - start < 8) {
          /* Identical bounded synthetic CPU cost. */
        }
        const items = views
          .filter((view) => view.sequence > Number(data['after']))
          .slice(0, 16);
        return {
          items: items.map((view) => ({
            ...view,
            deleted: false,
            deletion: null,
          })),
          next: items.at(-1)?.sequence ?? null,
        };
      }
      if (operation === 'group-message-recent')
        return { items: views.slice(-16), next: null };
      if (operation === 'group-message-relations') return { ids: [] };
      if (operation === 'group-message-confirm') return {};
      throw new Error('Unexpected synthetic operation');
    },
    read: (raw: unknown) =>
      Promise.resolve({ views: (raw as { items: GroupView[] }).items }),
  };
  try {
    for (let round = 0; round < 32 && !complete; round++) {
      const started = performance.now();
      await sync.background(() =>
        lease(async () => {
          try {
            await windows.read(context, null);
            complete = true;
          } catch (error: unknown) {
            if (!(error instanceof IncompleteGroupIndex)) throw error;
          }
        }),
      );
      metrics.schedulerRunMs.push(performance.now() - started);
      if (send.work) await send.work;
      await lease(() => {
        for (const accepted of pending.splice(0, 16)) {
          metrics.receiptMs.push(performance.now() - accepted);
          metrics.received++;
          paint('Synthetic receipt');
          metrics.displayMs.push(performance.now() - accepted);
          if (accepted === sendAt) {
            metrics.sendToReceiptMs = performance.now() - accepted;
            metrics.sendToDisplayMs = performance.now() - accepted;
          }
        }
        return Promise.resolve();
      });
      await delay();
    }
    await Promise.all(navigation);
    await delay();
    return {
      ...metrics,
      complete,
      repeatedPages: metrics.pages.length - new Set(metrics.pages).size,
      sendQueuedAt: sendAt > 0,
    };
  } finally {
    observer?.disconnect();
    visits.reset();
    sync.close();
  }
}
