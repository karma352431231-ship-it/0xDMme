import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import { MessageStorageError } from '../../src/client/message-storage/index.ts';
import {
  isSyncSnapshot,
  sameSyncFence,
} from '../../src/shared/message-sync/index.ts';
import { digest } from '../../src/shared/devices/index.ts';
import { mergeHistory } from '../../src/client/local-history/index.ts';
import { verifiedReceipt } from '../../src/client/messages/index-sync.ts';
import type {
  Messages,
  MessageView,
  ConversationProjection,
} from '../../src/client/messages/controller.ts';
import type { MessageItem } from '../../src/client/messages/history.ts';
import type {
  VaultAuthority,
  VaultAccess,
} from '../../src/client/vault-authority/index.ts';
import type { VaultSync } from '../../src/client/vault-sync/index.ts';
import type { notificationMessages } from '../../src/client/messages/notification.ts';
import type { AccountSession } from '../../src/shared/account/index.ts';

// Keep the actual controller, authenticated API, index, receipts and visibility.
// Only local persistence/search adapters use synthetic records; no SDK decoding
// or real browser durability is claimed by this lifecycle fixture.
const adapters: Record<string, string[]> = {
  'local-history': [
    'conversationHistory',
    'relatedHistory',
    'mergeHistory',
    'historyRecord',
    'historyPeers',
    'searchHistory',
  ],
  'message-storage': [
    'MessageStorageError',
    'localGet',
    'localPut',
    'localDelete',
    'localPage',
    'sealLocal',
    'openLocal',
    'enqueueOutbox',
    'outboxPage',
    'removeOutbox',
  ],
  'message-search': ['indexSearch', 'searchMessages'],
};
const bundle = await build({
  stdin: {
    contents:
      "export { Messages } from './src/client/messages/controller.ts'; export { notificationMessages } from './src/client/messages/notification.ts';",
    resolveDir: process.cwd(),
    loader: 'ts',
  },
  bundle: true,
  write: false,
  platform: 'browser',
  format: 'iife',
  globalName: 'messageController',
  define: {
    'import.meta.url': '"https://0xdmme.app/synthetic.js"',
    ATTACHMENT_WORKER_URL: '"/unused"',
  },
  plugins: [
    {
      name: 'local-message-adapters',
      setup(builder) {
        builder.onResolve(
          {
            filter:
              /^\.\.\/(local-history|message-storage|message-search)\/index\.ts$/,
          },
          ({ path, importer }) =>
            importer.includes('/messages/')
              ? { path: path.split('/')[1]!, namespace: 'fixture' }
              : undefined,
        );
        builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({
          contents: adapters[path]!.map(
            (name) => `export const ${name} = fixture.${name};`,
          ).join('\n'),
          loader: 'js',
        }));
      },
    },
  ],
});
const source = bundle.outputFiles[0]?.text ?? '';
if (!source) throw new Error('Fixture de retomada ausente.');

export function resumeFixture(incremental = false) {
  const session: AccountSession = {
    accountId: crypto.randomUUID(),
    deviceId: crypto.randomUUID(),
    csrf: 'a'.repeat(64),
    expiresAt: '2027-01-01T00:00:00.000Z',
    address: '0x' + '1'.repeat(40),
    ecosystem: 'evm',
    name: 'Sintético',
    profileRevision: 0,
    deviceState: 'pending',
    historyAuthorized: false,
  };
  const peer = crypto.randomUUID();
  const data = {
    snapshot: {
      revision: 1,
      contacts: 1,
      directory: 'b'.repeat(64),
      ...(incremental
        ? {
            version: 2 as const,
            account: session.accountId,
            device: session.deviceId,
            anchor: 0,
            invalidation: 0,
            source: 'full' as const,
          }
        : {}),
    },
    items: [] as MessageItem[],
    records: new Map<string, unknown>(),
    changes: null as MessageItem[] | null,
    cacheReads: [] as string[],
    requests: [] as string[],
    pages: [] as { after: number; through: number }[],
    beforePage: undefined as (() => Promise<void>) | undefined,
    pageFailure: null as number | null,
    failure: null as string | null,
    confirmation: null as (() => Promise<Response>) | null,
    frames: [] as (MessageView[] | null)[],
    publication: undefined as
      | ((
          rows: readonly MessageView[] | null,
          projection: ConversationProjection,
        ) => void)
      | undefined,
    authorityReads: 0,
    beforeDelivery: undefined as (() => void) | undefined,
    beforeLocalRead: undefined as ((name: string) => void) | undefined,
    beforeLocalOpen: undefined as (() => void) | undefined,
  };
  const authority: VaultAuthority = {
    session,
    directory: data.snapshot.directory,
    epoch: 1,
    events: [],
    offline: false,
    sign: () => Promise.resolve('synthetic-signature'),
    key: () => Promise.reject(new Error('Sem chave real na fixture.')),
  };
  const access: VaultAccess = {
    withVault: (_offline, work) => {
      data.authorityReads++;
      return work(authority);
    },
    withLocalVault: (_locator, work) => work(authority),
  };
  const unused = () => {
    throw new Error('Operação fora do contrato de retomada.');
  };
  const fixture = {
    MessageStorageError,
    conversationHistory: () => Promise.resolve([]),
    relatedHistory: () => Promise.resolve([]),
    mergeHistory,
    historyRecord: unused,
    historyPeers: unused,
    searchHistory: unused,
    localGet: (_scope: string, name: string) => {
      data.beforeLocalRead?.(name);
      data.cacheReads.push(name);
      return Promise.resolve(data.records.get(name) ?? null);
    },
    localPut: (_scope: string, name: string, value: unknown) => {
      data.records.set(name, value);
      return Promise.resolve();
    },
    localDelete: unused,
    localPage: unused,
    sealLocal: (_a: unknown, name: string, text: string) =>
      Promise.resolve({ id: name, text, bytes: new Uint8Array(text.length) }),
    enqueueOutbox: unused,
    outboxPage: (_scope: string, names: readonly string[]) =>
      Promise.resolve(
        names
          .filter((name) => data.records.has(name))
          .map((name) => ({ name, value: data.records.get(name) })),
      ),
    removeOutbox: unused,
    openLocal: (_a: unknown, cipher: { text: string }) => {
      data.beforeLocalOpen?.();
      return Promise.resolve(cipher.text);
    },
    indexSearch: () => Promise.resolve(),
    searchMessages: unused,
  };
  const confirmResponse = (input?: RequestInit): Promise<Response> => {
    if (data.confirmation) return data.confirmation();
    if (typeof input?.body !== 'string')
      throw new Error('Pedido de confirmação ausente.');
    const body = JSON.parse(input.body) as {
      payload: { snapshot: unknown };
    };
    const same =
      JSON.stringify(body.payload.snapshot) === JSON.stringify(data.snapshot) ||
      (isSyncSnapshot(body.payload.snapshot) &&
        isSyncSnapshot(data.snapshot) &&
        sameSyncFence(body.payload.snapshot, data.snapshot) &&
        body.payload.snapshot.revision <= data.snapshot.revision);
    return Promise.resolve(
      Response.json(same ? {} : { error: 'Estado alterado.' }, {
        status: same ? 200 : 409,
      }),
    );
  };
  const requestBody = (input?: RequestInit): string => {
    if (typeof input?.body !== 'string') throw new Error('Pedido ausente.');
    return input.body;
  };
  const changesResponse = (input?: RequestInit): Promise<Response> => {
    if (data.changes === null)
      return Promise.resolve(Response.json({ reset: true }));
    const body = JSON.parse(requestBody(input)) as {
      payload: { from: unknown; snapshot: unknown };
    };
    return Promise.resolve(
      Response.json({
        reset: false,
        ...body.payload,
        items: data.changes,
        next: null,
      }),
    );
  };
  const relationsResponse = (input?: RequestInit): Promise<Response> => {
    const body = JSON.parse(requestBody(input)) as {
      payload: { ids: string[]; snapshot: unknown };
    };
    const through = isSyncSnapshot(body.payload.snapshot)
      ? body.payload.snapshot.anchor
      : Number.MAX_SAFE_INTEGER;
    return Promise.resolve(
      Response.json({
        items: data.items.filter(
          (item) =>
            item.sequence <= through &&
            item.relation &&
            body.payload.ids.includes(item.relation.id) &&
            !item.deleted,
        ),
        next: null,
      }),
    );
  };
  const pageResponse = async (input?: RequestInit): Promise<Response> => {
    if (typeof input?.body !== 'string') throw new Error('Página ausente.');
    const body = JSON.parse(input.body) as {
      payload: { after: number; snapshot: unknown };
    };
    const through = isSyncSnapshot(body.payload.snapshot)
      ? body.payload.snapshot.anchor
      : Number.MAX_SAFE_INTEGER;
    data.pages.push({ after: body.payload.after, through });
    await data.beforePage?.();
    if (data.pageFailure)
      return Response.json(
        { error: 'Synthetic interruption.' },
        { status: data.pageFailure },
      );
    const remaining = data.items.filter(
      (item) => item.sequence > body.payload.after && item.sequence <= through,
    );
    const items = remaining.slice(0, 16);
    return Promise.resolve(
      Response.json({
        items,
        next: remaining.length > 16 ? items.at(-1)!.sequence : null,
      }),
    );
  };
  const deliveryResponse = (input?: RequestInit): Promise<Response> => {
    data.beforeDelivery?.();
    const body = JSON.parse(requestBody(input)) as {
      payload: { snapshot: unknown };
    };
    if (!(
      JSON.stringify(body.payload.snapshot) === JSON.stringify(data.snapshot) ||
      (isSyncSnapshot(body.payload.snapshot) &&
        isSyncSnapshot(data.snapshot) &&
        sameSyncFence(body.payload.snapshot, data.snapshot))
    ))
      return Promise.resolve(
        Response.json(
          { error: 'Messages or permissions changed. Sync again.' },
          { status: 409 },
        ),
      );
    return Promise.resolve(
      Response.json(
        data.items.map((item) => ({
          id: item.id,
          hash: item.hash,
          queue_active: false,
          recipient_received: true,
        })),
      ),
    );
  };
  const snapshotResponse = (input?: RequestInit): Promise<Response> => {
    const body = JSON.parse(requestBody(input)) as {
      payload: { from?: unknown };
    };
    const from = body.payload.from;
    if (incremental && isSyncSnapshot(from)) {
      if (from.revision === data.snapshot.revision)
        return Promise.resolve(Response.json(from));
      return Promise.resolve(
        Response.json({
          ...data.snapshot,
          source: data.changes === null ? 'full' : 'journal',
        }),
      );
    }
    return Promise.resolve(Response.json(data.snapshot));
  };
  const probeResponse = (input?: RequestInit): Promise<Response> => {
    data.beforeDelivery?.();
    const body = JSON.parse(requestBody(input)) as {
      payload: { from: unknown };
    };
    const from = body.payload.from;
    const same =
      isSyncSnapshot(from) && from.revision === data.snapshot.revision;
    return Promise.resolve(
      Response.json({
        snapshot: same ? from : data.snapshot,
        items: same
          ? data.items.map((row) => ({
              id: row.id,
              hash: row.hash,
              queue_active: false,
              recipient_received: true,
            }))
          : null,
      }),
    );
  };
  const previewResponse = (): Promise<Response> =>
    Promise.resolve(
      Response.json({
        items: data.items.filter((item) => !item.relation),
        next: null,
      }),
    );
  const deniedResponse = (): Promise<Response> =>
    Promise.resolve(
      Response.json({ error: 'Not authorized.' }, { status: 403 }),
    );
  const respond = (path: string, input?: RequestInit): Promise<Response> => {
    // This fixture intentionally retains legacy snapshots to exercise compatibility.
    const wireOperation = path.split('/').at(-1)!;
    const operation = legacyOperation(wireOperation);
    data.requests.push(operation);
    if (operation === data.failure) return deniedResponse();
    if (operation === 'snapshot') return snapshotResponse(input);
    if (operation === 'sync-probe') return probeResponse(input);
    if (operation === 'changes') return changesResponse(input);
    if (operation === 'page') return pageResponse(input);
    if (operation === 'preview') return previewResponse();
    if (operation === 'relations') return relationsResponse(input);
    if (operation === 'delivery') return deliveryResponse(input);
    if (operation === 'confirm') return confirmResponse(input);
    throw new Error('Requisição inesperada: ' + operation);
  };
  const context = {
    fixture,
    crypto,
    TextEncoder,
    TextDecoder,
    AbortController,
    AbortSignal,
    URL,
    Response,
    Error,
    setTimeout,
    clearTimeout,
    fetch: respond,
    navigator: { onLine: true },
    messageController: undefined as
      | {
          Messages: typeof Messages;
          notificationMessages: typeof notificationMessages;
        }
      | undefined,
  };
  runInNewContext(source, context);
  assert.ok(context.messageController);
  const controller = new context.messageController.Messages(
    access,
    {} as VaultSync,
    (rows, _update, projection) => {
      data.frames.push(
        rows === null ? null : Array.from(rows, (row) => ({ ...row })),
      );
      data.publication?.(rows, projection);
    },
  );
  controller.setSession(session);
  controller.select(peer);
  const add = async (
    text: string,
    from = peer,
    relation?: MessageItem['relation'],
  ) => {
    const item: MessageItem = {
      id: crypto.randomUUID(),
      kind: 'text',
      sender: from,
      recipient: session.accountId,
      ...(relation ? { relation } : {}),
      sequence: data.items.length + 1,
      hash: 'c'.repeat(64),
      deleted: false,
      deletion: null,
      sender_revision: 1,
      recipient_revision: 1,
      queue_active: false,
      status: 'received',
    };
    data.items.push(item);
    if (incremental)
      Object.assign(data.snapshot, {
        anchor: item.sequence,
        revision: data.snapshot.revision + 1,
      });
    data.records.set(`cache:${item.id}`, {
      text,
      verification: {
        text: verifiedReceipt(data.snapshot, item, await digest(text)),
      },
    });
    return item;
  };
  const notificationReader = (signal: AbortSignal) =>
    context.messageController!.notificationMessages({
      access,
      session,
      signal,
      sync: {
        refresh: () => Promise.resolve(),
        complete: true,
        currentHeads: () => new Map(),
        isRemoved: () => false,
      } as unknown as VaultSync,
    });
  const addProfile = async (text: string, from = peer, own = false) => {
    const item = await add(text, from);
    item.kind = 'profile';
    if (own) {
      item.sender = session.accountId;
      item.recipient = from;
    }
    data.records.delete(`cache:${item.id}`);
    data.records.set(`profile:${item.id}`, {
      id: item.id,
      peer: from,
      own,
      sequence: item.sequence,
      hash: item.hash,
      draft: [{ text }],
      verification: {
        text: verifiedReceipt(data.snapshot, item, await digest(text)),
      },
    });
    return item;
  };
  return {
    controller,
    data,
    session,
    peer,
    add,
    addProfile,
    access,
    notificationReader,
  };
}

function legacyOperation(operation: string): string {
  return operation === 'sync-state' ? 'snapshot' : operation;
}
