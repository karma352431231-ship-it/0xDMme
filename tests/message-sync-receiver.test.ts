import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MessageSyncReceiver } from '../src/client/messages/sync-receiver.ts';
import type { SyncReceiverPorts } from '../src/client/messages/sync-receiver.ts';
import type { SyncProgress } from '../src/client/messages/sync-progress.ts';
import type { MessageItem } from '../src/client/messages/history.ts';
import { MessageStorageError } from '../src/client/message-storage/index.ts';
import { ApiResponseError } from '../src/client/api-response/index.ts';
import {
  messageSyncConflict,
  syncSnapshot,
} from '../src/shared/message-sync/index.ts';
import type { MessageSyncSnapshot } from '../src/shared/message-sync/index.ts';
const account = crypto.randomUUID(),
  device = crypto.randomUUID();
function checkpoint(
  revision: number,
  source: MessageSyncSnapshot['source'] = 'full',
): MessageSyncSnapshot {
  return {
    version: 2,
    account,
    device,
    revision,
    anchor: revision,
    invalidation: 0,
    directory: 'a'.repeat(64),
    contacts: 0,
    source,
  };
}
function item(sequence: number, peer = crypto.randomUUID()): MessageItem {
  return {
    id: crypto.randomUUID(),
    sender: peer,
    recipient: account,
    sequence,
    hash: 'b'.repeat(64),
    kind: 'text',
    deleted: false,
    deletion: null,
    sender_revision: 1,
    recipient_revision: 1,
    queue_active: true,
    status: 'pending',
  };
}
function harness(initial: MessageItem[]) {
  let state: SyncProgress = {
    version: 2,
    session: 'session',
    discovered: null,
    applied: null,
    target: null,
    after: 0,
    pending: [],
  };
  const rows = [...initial],
    commits: Parameters<SyncReceiverPorts<View>['commit']>[0][] = [];
  const cached = new Set<string>(),
    removed = new Set<string>(),
    calls: string[] = [];
  const ports: SyncReceiverPorts<View> = {
    account,
    device,
    guard: () => {},
    load: () => Promise.resolve(structuredClone(state)),
    save: (next) => {
      state = structuredClone(next);
      return Promise.resolve();
    },
    api: (op, data) => {
      calls.push(op);
      if (op === 'snapshot') {
        const from = data['from'] as MessageSyncSnapshot | null;
        return Promise.resolve(
          from?.revision === rows.length
            ? from
            : checkpoint(rows.length, from ? 'tail' : 'full'),
        );
      }
      const snapshot = syncSnapshot(data['snapshot']);
      if (op === 'confirm') return Promise.resolve(null);
      if (op === 'page' || op === 'sync-peer-page') {
        const through = Number(data['through'] ?? snapshot.anchor);
        const selected = rows.filter(
          (row) =>
            row.sequence > Number(data['after']) &&
            row.sequence <= through &&
            (op !== 'sync-peer-page' || row.sender === data['peer']),
        );
        const items = selected.slice(0, 16);
        return Promise.resolve({
          items,
          next: selected.length > 16 ? items.at(-1)!.sequence : null,
        });
      }
      throw new Error('Unexpected operation: ' + op);
    },
    remove: (row) => {
      removed.add(row.id);
      cached.delete(row.id);
      return Promise.resolve();
    },
    read: (_snapshot, items) => {
      for (const row of items) {
        assert.equal(removed.has(row.id), false);
        cached.add(row.id);
      }
      return Promise.resolve(
        items.map((row) => ({ id: row.id, peer: row.sender, state: 'ready' })),
      );
    },
    commit: (batch) => {
      commits.push(batch);
    },
    suspendedState: 'suspended',
  };
  return {
    ports,
    rows,
    commits,
    cached,
    removed,
    calls,
    state: () => structuredClone(state),
    replace: (next: SyncProgress) => {
      state = structuredClone(next);
    },
  };
}
interface View {
  id: string;
  peer: string;
  state: string;
}

for (const contacts of [30, 50])
  await test(`${contacts} senders to one slow receiver advance while thousands of arrivals continue`, async () => {
    const peers = Array.from({ length: contacts }, () => crypto.randomUUID());
    const h = harness(
      Array.from({ length: 257 }, (_, n) => item(n + 1, peers[n % contacts])),
    );
    const originalApi = h.ports.api;
    let arrivals = 0;
    h.ports.api = (op, data) => {
      // Producer remains active during snapshot, every page and final confirmation.
      if (op === 'page' || op === 'confirm')
        for (let n = 0; n < 17; n++) {
          h.rows.push(item(h.rows.length + 1, peers[arrivals++ % contacts]));
        }
      return originalApi(op, data);
    };
    const receiver = new MessageSyncReceiver();
    for (let turn = 0; turn < 100; turn++) {
      await receiver.step(h.ports);
      if (
        arrivals >= 2000 &&
        h.state().discovered &&
        h.state().discovered!.anchor > 257
      )
        break;
    }
    assert.ok(arrivals >= 2000);
    assert.ok(
      h.state().discovered!.anchor > 257,
      'progress must happen before stopping the producer',
    );
    const confirmed = h.state().discovered!.anchor;
    assert.deepEqual(
      h.rows
        .filter((row) => row.sequence <= confirmed)
        .map((row) => row.id)
        .sort(),
      [...h.cached]
        .filter(
          (id) => h.rows.find((row) => row.id === id)!.sequence <= confirmed,
        )
        .sort(),
    );
    const complete = h.commits.filter((batch) => batch.complete);
    assert.ok(complete.length >= 2);
    assert.equal(complete[0]!.snapshot.anchor, 257);
    assert.equal(
      h.commits.filter(
        (batch) => batch.snapshot.source === 'full' && batch.after === 0,
      ).length,
      1,
    );
    const published = h.commits.flatMap((batch) =>
      batch.views.map((view) => view.id),
    );
    assert.equal(new Set(published).size, published.length);
  });

await test('bad key records a durable per-peer range; other peers advance and restart recovers the obligation', async () => {
  const broken = crypto.randomUUID(),
    healthy = crypto.randomUUID();
  const h = harness([item(1, broken), item(2, healthy)]),
    read = h.ports.read;
  h.ports.read = (snapshot, rows) => {
    if (rows.some((row) => row.sender === broken))
      throw new Error('Missing key');
    return read(snapshot, rows);
  };
  await new MessageSyncReceiver().step(h.ports);
  assert.equal(h.state().discovered!.revision, 2);
  assert.equal(h.state().applied, null);
  assert.equal(h.state().pending.length, 1);
  assert.ok(h.cached.has(h.rows[1]!.id));
  const saved = h.state();
  saved.pending[0]!.retryAt = 0;
  h.replace(saved);
  h.ports.read = read;
  await new MessageSyncReceiver().step(h.ports);
  assert.equal(h.state().pending.length, 0);
  assert.equal(h.state().applied!.revision, 2);
  assert.ok(h.cached.has(h.rows[0]!.id));
});

await test('consent suspension leaves an explicit obligation without applying its cursor', async () => {
  const h = harness([item(1)]);
  h.ports.read = (_snapshot, rows) =>
    Promise.resolve(
      rows.map((row) => ({ id: row.id, peer: row.sender, state: 'suspended' })),
    );
  await new MessageSyncReceiver().step(h.ports);
  assert.equal(h.state().pending[0]!.reason, 'consent');
  assert.equal(h.state().applied, null);
});

for (const error of [
  new MessageStorageError('Full'),
  new ApiResponseError({
    operation: 'messages/page',
    status: 403,
    failure: 'http',
  }),
])
  await test(`global failure ${error.constructor.name} cannot acknowledge or commit discovery`, async () => {
    const h = harness([item(1)]);
    h.ports.read = () => Promise.reject(error);
    await assert.rejects(new MessageSyncReceiver().step(h.ports), error);
    assert.equal(h.state().discovered, null);
    assert.equal(h.commits.length, 0);
  });

await test('unverified deletion, cancellation and missing read results never advance the cursor', async () => {
  const h = harness([{ ...item(1), deleted: true }]);
  h.ports.remove = () => Promise.reject(new Error('Bad signature'));
  await assert.rejects(
    new MessageSyncReceiver().step(h.ports),
    /Message deletion verification failed/,
  );
  assert.equal(h.state().discovered, null);
  h.rows[0]!.deleted = false;
  h.ports.read = () => Promise.resolve([]);
  await new MessageSyncReceiver().step(h.ports);
  assert.equal(h.state().applied, null);
  assert.equal(h.state().pending.length, 1);
  h.ports.guard = () => {
    throw new Error('Session changed');
  };
  await assert.rejects(
    new MessageSyncReceiver().step(h.ports),
    /Session changed/,
  );
});

await test('security invalidation clears the persisted target but preserves the confirmed checkpoint', async () => {
  const h = harness(Array.from({ length: 20 }, (_, n) => item(n + 1)));
  await new MessageSyncReceiver().step(h.ports);
  assert.equal(h.state().after, 16);
  const api = h.ports.api;
  h.ports.api = (op, data) =>
    op === 'page'
      ? Promise.reject(
          new ApiResponseError({
            operation: 'messages/page',
            status: 409,
            failure: 'http',
            message: messageSyncConflict,
          }),
        )
      : api(op, data);
  await assert.rejects(new MessageSyncReceiver().step(h.ports), {
    status: 409,
  });
  assert.equal(h.state().target, null);
  assert.equal(h.state().after, 0);
  assert.equal(h.state().discovered, null);
});

await test('persisted recovery status stays visible on an idle reconnect and a key hint wakes its bounded retry', async () => {
  const h = harness([item(1)]),
    read = h.ports.read;
  h.ports.read = () => Promise.reject(new Error('Missing key'));
  await new MessageSyncReceiver().step(h.ports);
  const statuses: number[] = [];
  h.ports.status = (pending) => statuses.push(pending.length);
  h.ports.read = read;
  assert.equal(await new MessageSyncReceiver().step(h.ports), false);
  assert.deepEqual(statuses, [1]);
  assert.equal(h.state().pending.length, 1);
  h.ports.wakeRecovery = true;
  await new MessageSyncReceiver().step(h.ports);
  assert.equal(h.state().pending.length, 0);
});

await test('a recovering peer finishes frozen subranges even while later messages keep arriving', async () => {
  const peer = crypto.randomUUID(),
    h = harness(Array.from({ length: 40 }, (_, n) => item(n + 1, peer))),
    read = h.ports.read;
  h.ports.read = () => Promise.reject(new Error('Missing key'));
  for (let n = 0; n < 3; n++) await new MessageSyncReceiver().step(h.ports);
  assert.equal(h.state().discovered!.anchor, 40);
  h.ports.read = read;
  h.ports.wakeRecovery = true;
  const api = h.ports.api,
    ends: number[] = [];
  h.ports.api = (operation, data) => {
    if (operation === 'sync-peer-page') ends.push(Number(data['through']));
    return api(operation, data);
  };
  for (let n = 0; n < 3; n++) {
    h.rows.push(item(h.rows.length + 1, peer));
    await new MessageSyncReceiver().step(h.ports);
  }
  assert.deepEqual(ends, [40, 40, 40]);
  assert.equal(h.state().pending[0]!.after, 40);
  assert.ok(h.state().pending[0]!.through > 40);
});

await test('a foreign device cut is rejected before any receipt or progress mutation', async () => {
  const h = harness([item(1)]);
  h.ports.api = () =>
    Promise.resolve({ ...checkpoint(1), device: crypto.randomUUID() });
  await assert.rejects(
    new MessageSyncReceiver().step(h.ports),
    /another device/,
  );
  assert.equal(h.state().discovered, null);
  assert.equal(h.commits.length, 0);
});

function journalCut256() {
  const h = harness(Array.from({ length: 256 }, (_, n) => item(n + 1))),
    saved = h.state();
  saved.discovered = checkpoint(0);
  h.replace(saved);
  const api = h.ports.api,
    cut = checkpoint(256, 'journal');
  let manifests = 0;
  h.ports.api = (op, data) => {
    if (op === 'snapshot') return Promise.resolve(cut);
    if (op === 'changes') {
      manifests++;
      return Promise.resolve({
        reset: false,
        from: data['from'],
        snapshot: data['snapshot'],
        items: h.rows,
        next: null,
      });
    }
    return api(op, data);
  };
  return { h, manifests: () => manifests };
}
await test('a 256-ID journal cut yields after 16 packets per turn without replacing its target or refetching its manifest', async () => {
  const { h, manifests } = journalCut256();
  const receiver = new MessageSyncReceiver();
  for (let n = 0; n < 16; n++) {
    await receiver.step(h.ports);
    assert.equal(h.commits.at(-1)!.views.length, 16);
    if (n < 15) assert.equal(h.state().discovered!.revision, 0);
  }
  assert.equal(h.state().discovered!.revision, 256);
  assert.equal(h.cached.size, 256);
  assert.equal(manifests(), 1, 'one manifest read for the whole cut');
});

await test('a restart inside a journal cut refetches its manifest once and resumes at the saved checkpoint', async () => {
  const { h, manifests } = journalCut256();
  for (let n = 0; n < 5; n++) await new MessageSyncReceiver().step(h.ports);
  assert.equal(manifests(), 5, 'each restart reads the manifest again');
  const resumed = new MessageSyncReceiver();
  for (let n = 5; n < 16; n++) await resumed.step(h.ports);
  assert.equal(manifests(), 6);
  const applied = h.commits.flatMap((commit) => commit.views.map((v) => v.id));
  assert.equal(applied.length, 256, 'no page applied twice');
  assert.equal(new Set(applied).size, 256);
  assert.equal(h.state().discovered!.revision, 256);
});

await test('active recovery and new traffic share the 16-packet turn fairly', async () => {
  const broken = crypto.randomUUID(),
    h = harness([item(1, broken)]),
    read = h.ports.read;
  h.ports.read = () => Promise.reject(new Error('Missing key'));
  await new MessageSyncReceiver().step(h.ports);
  h.rows.push(...Array.from({ length: 32 }, (_, n) => item(n + 2)));
  h.ports.read = read;
  h.ports.wakeRecovery = true;
  let opened = 0;
  h.ports.read = (snapshot, items) => {
    opened += items.length;
    return read(snapshot, items);
  };
  await new MessageSyncReceiver().step(h.ports);
  assert.ok(opened <= 16);
  assert.ok(h.state().pending.length === 0);
  assert.ok(h.commits.at(-1)!.views.some((view) => view.peer !== broken));
});

await test('the durable checkpoint another tab advanced is reported before any work, even when idle', async () => {
  const h = harness([item(1)]);
  const observed: (MessageSyncSnapshot | null)[] = [];
  h.ports.observed = (discovered) => observed.push(discovered);
  await new MessageSyncReceiver().step(h.ports);
  const committed = h.state().discovered;
  assert.ok(committed);
  // Another tab of this device already applied the change: this turn is idle.
  await new MessageSyncReceiver().step(h.ports);
  assert.deepEqual(observed, [null, committed]);
  assert.equal(h.commits.length, 1, 'an idle turn commits nothing');
});
