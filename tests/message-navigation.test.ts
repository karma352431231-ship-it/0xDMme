import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import type {
  Messages,
  MessageView,
} from '../src/client/messages/controller.ts';
import type {
  VaultAccess,
  VaultAuthority,
} from '../src/client/vault-authority/index.ts';
import type { VaultSync } from '../src/client/vault-sync/index.ts';
import { verifiedReceipt } from '../src/client/messages/index-sync.ts';
import { digest, canonical } from '../src/shared/devices/index.ts';
import { ConversationWindows } from '../src/client/messages/conversation-windows.ts';
import type { MessageItem } from '../src/client/messages/history.ts';
import type { AccountSession } from '../src/shared/account/index.ts';

// Exercise the actual controller, index and visibility across navigation. Only
// transport and durable storage boundaries are synthetic; no private methods
// are replaced and every unexpected network operation fails the test.
const exportsByModule: Record<string, string[]> = {
  'message-api': ['messageApi', 'backupMessageApi'],
  'message-storage': [
    'localGet',
    'localPut',
    'localDelete',
    'localPage',
    'sealLocal',
    'openLocal',
    'localPutWithin',
    'localStoreKey',
  ],
  'message-search': ['indexSearch', 'searchMessages'],
  'local-history': [
    'conversationHistory',
    'relatedHistory',
    'historyRecord',
    'historyPeers',
    'mergeHistory',
    'searchHistory',
    'forgetDmRecord',
  ],
};
const bundle = await build({
  entryPoints: ['src/client/messages/controller.ts'],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'cjs',
  packages: 'external',
  plugins: [
    {
      name: 'storage-and-transport',
      setup(builder) {
        builder.onResolve(
          { filter: /^\.\.\/[^/]+\/index\.ts$/ },
          ({ path }) => {
            const name = path.split('/')[1]!;
            return exportsByModule[name]
              ? { path: name, namespace: 'fixture' }
              : undefined;
          },
        );
        builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({
          contents: exportsByModule[path]!.map(
            (name) =>
              `export const ${name} = (...args) => fixture.${name}(...args);`,
          ).join('\n'),
          loader: 'js',
        }));
      },
    },
  ],
});

async function environment() {
  const account = crypto.randomUUID(),
    peers = [crypto.randomUUID(), crypto.randomUUID()];
  const session: AccountSession = {
    accountId: account,
    deviceId: crypto.randomUUID(),
    csrf: 'a'.repeat(64),
    ecosystem: 'evm',
    address: '0x' + '1'.repeat(40),
    name: 'Synthetic account',
    deviceState: 'pending',
    historyAuthorized: false,
    profileRevision: 1,
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
  };
  const authority: VaultAuthority = {
    session,
    directory: 'b'.repeat(64),
    epoch: 1,
    events: [],
    offline: false,
    sign: () => Promise.reject(new Error('Unexpected signing')),
    key: () => Promise.reject(new Error('Unexpected key request')),
  };
  const state = { revision: 1, directory: authority.directory, contacts: 1 };
  const items: MessageItem[] = peers.map((peer, i) => ({
    id: crypto.randomUUID(),
    kind: 'text',
    sender: peer,
    recipient: account,
    sequence: i + 1,
    hash: String(i + 1).repeat(64),
    deleted: false,
    deletion: null,
    sender_revision: 1,
    recipient_revision: 1,
    queue_active: false,
    status: 'received',
  }));
  const stored = new Map<string, unknown>();
  for (const item of items) {
    const text = `Synthetic message ${item.sequence}`;
    stored.set(`cache:${item.id}`, {
      text,
      verification: { text: verifiedReceipt(state, item, await digest(text)) },
    });
  }
  const calls: string[] = [];
  let failConfirm = false;
  let onConfirm = () => {};
  const fixture = {
    messageApi: (
      _a: unknown,
      op: string,
      data: Record<string, unknown>,
      guard: () => void,
    ) => {
      guard();
      calls.push(op);
      if (op === 'snapshot') return { ...state };
      if (op === 'page') return { items: structuredClone(items), next: null };
      if (op === 'relations') return { items: [], next: null };
      if (op === 'delivery')
        return (data['ids'] as string[]).map((id) => ({
          id,
          hash: items.find((item) => item.id === id)!.hash,
          queue_active: false,
          recipient_received: true,
        }));
      if (op === 'confirm') {
        onConfirm();
        if (failConfirm) throw new Error('Synthetic confirmation failure');
        guard();
        return null;
      }
      throw new Error(`Unexpected network operation: ${op}`);
    },
    localGet: (_account: string, key: string) =>
      Promise.resolve(stored.get(key) ?? null),
    openLocal: (_a: unknown, value: { text: string }) =>
      Promise.resolve(value.text),
    indexSearch: () => Promise.resolve(),
    conversationHistory: () => Promise.resolve([]),
    relatedHistory: () => Promise.resolve([]),
    mergeHistory: (remote: MessageView[]) => remote,
  };
  const output = { exports: {} as { Messages: typeof Messages } };
  runInNewContext(bundle.outputFiles[0]!.text, {
    module: output,
    exports: output.exports,
    fixture,
    require: createRequire(import.meta.url),
    structuredClone,
    crypto,
    TextEncoder,
    TextDecoder,
    AbortController,
    AbortSignal,
  });
  const access: VaultAccess = {
    withVault: (_offline, work) => work(authority),
    withLocalVault: (_locator, work) => work(authority),
  };
  let visible: readonly MessageView[] | null = null;
  const messages = new output.exports.Messages(
    access,
    {} as VaultSync,
    (rows) => {
      visible = rows;
    },
  );
  messages.setSession(session);
  return {
    messages,
    session,
    peers,
    calls,
    state,
    items,
    visible: () => visible,
    fail: () => {
      failConfirm = true;
    },
    onConfirm: (work: () => void) => {
      onConfirm = work;
    },
  };
}

await test('A → B → A restores verified messages without network or decryption; hints require confirmation', async () => {
  const e = await environment();
  for (const peer of e.peers) {
    e.messages.select(peer);
    await e.messages.synchronize();
    assert.equal(e.visible()?.[0]?.peer, peer);
  }
  const count = e.calls.length;
  e.messages.select(null); // The mobile back button closes the view, not the session.
  e.messages.select(e.peers[0]!);
  assert.equal(e.messages.restoreSelected(), true);
  assert.equal(e.visible()?.[0]?.text, 'Synthetic message 1');
  assert.equal(e.calls.length, count);
  e.messages.hint();
  assert.equal(e.messages.canRestore(e.peers[1]!), false);
  assert.equal(await e.messages.probe(), false);
  assert.equal(e.messages.canRestore(e.peers[1]!), true);
  e.messages.select(e.peers[0]!, true);
  assert.equal(
    e.messages.restoreSelected(),
    false,
    'Older pages cannot use the latest window',
  );
});

await test('removal, suspension, connection loss and failed confirmation prohibit stale navigation', async () => {
  const e = await environment();
  for (const invalidate of [
    () => e.messages.removed(),
    () => e.messages.close(),
    () => e.messages.invalidateConversations(),
    () => e.messages.hide(),
  ]) {
    e.messages.select(e.peers[0]!);
    await e.messages.synchronize();
    invalidate();
    assert.equal(e.messages.canRestore(e.peers[0]!), false);
  }
  e.messages.select(e.peers[0]!);
  await e.messages.synchronize();
  e.fail();
  await assert.rejects(e.messages.probe(), /confirmation failure/);
  assert.equal(e.visible(), null);
  assert.equal(e.messages.canRestore(e.peers[0]!), false);
});

await test('a changed snapshot evicts prior windows and a removal during confirmation cannot republish them', async () => {
  const e = await environment();
  e.messages.select(e.peers[0]!);
  await e.messages.synchronize();
  e.state.revision++;
  e.messages.select(e.peers[1]!);
  await e.messages.synchronize();
  assert.equal(e.messages.canRestore(e.peers[0]!), false);
  e.onConfirm(() => e.messages.removed());
  await assert.rejects(e.messages.probe());
  assert.equal(e.visible(), null);
  assert.equal(e.messages.canRestore(e.peers[1]!), false);
});

await test('conversation windows enforce count/byte budgets and isolate returned data', () => {
  const cache = new ConversationWindows<{ text: string }>();
  const snapshot = { revision: 1 };
  cache.confirm(snapshot);
  const window = {
    snapshot: canonical(snapshot),
    views: [{ text: 'synthetic' }],
    oldest: 1,
  };
  for (let i = 0; i < 17; i++) cache.remember(String(i), window);
  assert.equal(cache.has('0'), false);
  const read = cache.read('1')!;
  read.views[0]!.text = 'changed';
  assert.equal(cache.read('1')?.views[0]?.text, 'synthetic');
  cache.remember('huge', {
    ...window,
    views: [{ text: 'x'.repeat(5 * 1024 * 1024) }],
  });
  assert.equal(cache.has('huge'), false);
  cache.clear();
  assert.equal(cache.has('1'), false);
});

await test('same-session rechecks preserve navigation, while profile updates and logout invalidate it', async () => {
  const e = await environment();
  e.messages.select(e.peers[0]!);
  await e.messages.synchronize();
  e.messages.setSession({ ...e.session });
  assert.equal(e.messages.canRestore(e.peers[0]!), true);
  e.messages.setSession({ ...e.session, profileRevision: 2 });
  assert.equal(e.messages.canRestore(e.peers[0]!), false);
  await e.messages.synchronize();
  e.messages.setSession(null);
  assert.equal(e.messages.canRestore(e.peers[0]!), false);
  assert.equal(e.visible(), null);
});
