import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import { digest } from '../../src/shared/devices/index.ts';
import { mergeHistory } from '../../src/client/local-history/index.ts';
import { verifiedReceipt } from '../../src/client/messages/index-sync.ts';
import type {
  Messages,
  MessageView,
} from '../../src/client/messages/controller.ts';
import type { MessageItem } from '../../src/client/messages/history.ts';
import type {
  VaultAuthority,
  VaultAccess,
} from '../../src/client/vault-authority/index.ts';
import type { VaultSync } from '../../src/client/vault-sync/index.ts';
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
    'localGet',
    'localPut',
    'localDelete',
    'localPage',
    'sealLocal',
    'openLocal',
  ],
  'message-search': ['indexSearch', 'searchMessages'],
};
const bundle = await build({
  entryPoints: ['src/client/messages/controller.ts'],
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
            importer.endsWith('/messages/controller.ts')
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

export function resumeFixture() {
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
    snapshot: { revision: 1, contacts: 1, directory: 'b'.repeat(64) },
    items: [] as MessageItem[],
    records: new Map<string, unknown>(),
    cacheReads: [] as string[],
    requests: [] as string[],
    failure: null as string | null,
    confirmation: null as (() => Promise<Response>) | null,
    frames: [] as (MessageView[] | null)[],
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
    withVault: (_offline, work) => work(authority),
    withLocalVault: (_locator, work) => work(authority),
  };
  const unused = () => {
    throw new Error('Operação fora do contrato de retomada.');
  };
  const fixture = {
    conversationHistory: () => Promise.resolve([]),
    relatedHistory: () => Promise.resolve([]),
    mergeHistory,
    historyRecord: unused,
    historyPeers: unused,
    searchHistory: unused,
    localGet: (_scope: string, name: string) => {
      data.cacheReads.push(name);
      return Promise.resolve(data.records.get(name) ?? null);
    },
    localPut: unused,
    localDelete: unused,
    localPage: unused,
    sealLocal: unused,
    openLocal: (_a: unknown, cipher: { text: string }) =>
      Promise.resolve(cipher.text),
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
      JSON.stringify(body.payload.snapshot) === JSON.stringify(data.snapshot);
    return Promise.resolve(
      Response.json(same ? {} : { error: 'Estado alterado.' }, {
        status: same ? 200 : 409,
      }),
    );
  };
  const respond = (path: string, input?: RequestInit): Promise<Response> => {
    const operation = path.split('/').at(-1)!;
    data.requests.push(operation);
    if (operation === data.failure)
      return Promise.resolve(
        Response.json({ error: 'Sem autorização.' }, { status: 403 }),
      );
    if (operation === 'snapshot')
      return Promise.resolve(Response.json(data.snapshot));
    if (operation === 'page')
      return Promise.resolve(Response.json({ items: data.items, next: null }));
    if (operation === 'relations')
      return Promise.resolve(Response.json({ items: [], next: null }));
    if (operation === 'delivery')
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
    messageController: undefined as { Messages: typeof Messages } | undefined,
  };
  runInNewContext(source, context);
  assert.ok(context.messageController);
  const controller = new context.messageController.Messages(
    access,
    {} as VaultSync,
    (rows) => {
      data.frames.push(
        rows === null ? null : Array.from(rows, (row) => ({ ...row })),
      );
    },
  );
  controller.setSession(session);
  controller.select(peer);
  const add = async (text: string) => {
    const item: MessageItem = {
      id: crypto.randomUUID(),
      kind: 'text',
      sender: peer,
      recipient: session.accountId,
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
    data.records.set(`cache:${item.id}`, {
      text,
      verification: {
        text: verifiedReceipt(data.snapshot, item, await digest(text)),
      },
    });
    return item;
  };
  return { controller, data, session, peer, add };
}
