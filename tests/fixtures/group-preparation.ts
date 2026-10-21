import { build } from 'esbuild';
import { runInNewContext } from 'node:vm';
import { AuthorityWork } from '../../src/client/devices/authority-work.ts';
import type { MessageSynchronization } from '../../src/client/messages/synchronization.ts';
import type { ConnectedConversationVisits } from '../../src/client/messages/visits.ts';
import type { GroupController } from '../../src/client/groups/controller.ts';
import type { GroupView } from '../../src/client/groups/reader.ts';
import type { AccountSession } from '../../src/shared/account/index.ts';
import type { GroupEvent } from '../../src/shared/groups/index.ts';
import type { VaultAuthority } from '../../src/client/vault-authority/index.ts';
import type { VaultSync } from '../../src/client/vault-sync/index.ts';

// Real lifecycle, cursor, confirmation and signed HTTP adapter. Only SDK body
// decoding, governance signatures and encrypted storage are synthetic here.
const adapters: Record<string, string> = {
  '../message-session/index.ts':
    'export const openMessageMachine = fixture.open;',
  '../message-recovery/index.ts':
    'export const ensureMessageRecovery = async () => {};',
  '../peer-identity/index.ts':
    'export class PeerIdentity { clear() {} async load() {} async save(guard = () => {}) { guard(); } } export const readDirectories = () => {}; export const peerHistory = () => {};',
  './governance.ts':
    'export class GroupGovernance { async verify() { return fixture.group; } }',
  './reader.ts':
    'export const readGroupPage = async (_context, raw) => ({views:raw.items,receipts:[]});',
};
const bundle = await build({
  stdin: {
    contents:
      "export {GroupController} from './src/client/groups/controller.ts'; export {MessageSynchronization} from './src/client/messages/synchronization.ts'; export {ConnectedConversationVisits} from './src/client/messages/visits.ts';",
    resolveDir: process.cwd(),
    loader: 'ts',
  },
  bundle: true,
  write: false,
  platform: 'browser',
  format: 'iife',
  globalName: 'groups',
  define: {
    'import.meta.url': '"https://0xdmme.app/fixture.js"',
    ATTACHMENT_WORKER_URL: '"/unused"',
  },
  plugins: [
    {
      name: 'group-preparation-adapters',
      setup(builder) {
        builder.onResolve({ filter: /.*/ }, ({ path, importer }) => {
          if (adapters[path] && importer.endsWith('/groups/controller.ts'))
            return { path, namespace: 'fixture' };
        });
        builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({
          contents: adapters[path]!,
          loader: 'js',
        }));
      },
    },
  ],
});
export function groupPreparationFixture() {
  const session = {
    accountId: crypto.randomUUID(),
    deviceId: crypto.randomUUID(),
    csrf: 'a'.repeat(64),
  } as AccountSession;
  const groupId = crypto.randomUUID(),
    head = 'b'.repeat(64),
    directory = 'c'.repeat(64);
  const state: GroupEvent = {
    version: 1,
    groupId,
    revision: 1,
    epoch: 1,
    previous: null,
    kind: 'create',
    actor: session.accountId,
    deviceId: session.deviceId,
    directory,
    authorityRevision: 1,
    owner: session.accountId,
    members: [{ accountId: session.accountId, role: 'owner', joined: 1 }],
    target: null,
    consent: null,
    signature: 'A'.repeat(86) + '==',
  };
  const data = {
    calls: [] as string[],
    pages: [] as number[],
    views: [] as GroupView[],
    signals: [] as AbortSignal[],
    active: 0,
    maximum: 0,
    request: (_operation: string) => {
      void _operation;
      return Promise.resolve();
    },
  };
  const authority: VaultAuthority = {
    session,
    directory,
    offline: false,
    epoch: 1,
    events: [],
    key: () => Promise.reject(new Error('No real keys')),
    sign: () => Promise.resolve('synthetic'),
  };
  const queue = new AuthorityWork();
  const context = {
    fixture: {
      group: { state, head },
      open: () => {
        data.active++;
        data.maximum = Math.max(data.maximum, data.active);
        return Promise.resolve({
          prepare: async () => {},
          close: () => {
            data.active--;
          },
        });
      },
    },
    navigator: { onLine: true },
    document: { visibilityState: 'visible' },
    crypto,
    URL,
    atob,
    btoa,
    TextEncoder,
    TextDecoder,
    AbortController,
    AbortSignal,
    Response,
    Date,
    performance,
    Error,
    DOMException,
    setTimeout,
    clearTimeout,
    fetch: async (path: string, options: RequestInit) => {
      const operation = path.split('/').at(-1)!;
      const payload = (
        JSON.parse(typeof options.body === 'string' ? options.body : '') as {
          payload: Record<string, unknown>;
        }
      ).payload;
      data.calls.push(operation);
      if (options.signal) data.signals.push(options.signal);
      options.signal?.throwIfAborted();
      await data.request(operation);
      options.signal?.throwIfAborted();
      const handlers: Record<string, () => unknown> = {
        'group-list': () => ({ items: [state], next: null }),
        'group-message-snapshot': () => ({
          groupId,
          head,
          directory,
          revision: 1,
        }),
        'group-message-index': () => {
          data.pages.push(Number(payload['after']));
          const items = data.views
            .filter((view) => view.sequence > Number(payload['after']))
            .slice(0, 16);
          return {
            items: items.map((view) => ({
              ...view,
              deleted: false,
              deletion: null,
            })),
            next: items.at(-1)?.sequence ?? null,
          };
        },
        'group-message-recent': () => {
          const rows = data.views.filter(
            (view) =>
              payload['before'] === null ||
              view.sequence < Number(payload['before']),
          );
          return { items: rows.slice(-16), next: null };
        },
        'group-message-relations': () => ({ ids: [] }),
        'group-message-confirm': () => ({}),
      };
      if (!handlers[operation])
        throw new Error('Unexpected fixture operation: ' + operation);
      return Response.json(handlers[operation]());
    },
    groups: undefined as
      | {
          GroupController: typeof GroupController;
          MessageSynchronization: typeof MessageSynchronization;
          ConnectedConversationVisits: typeof ConnectedConversationVisits;
        }
      | undefined,
  };
  runInNewContext(bundle.outputFiles[0]!.text, context);
  const controller = new context.groups!.GroupController(
    {
      withVault: (_offline, work, options) =>
        queue.run(() => work(authority), options?.priority),
      withLocalVault: (_locator, work) => queue.run(() => work(authority)),
    },
    {} as VaultSync,
    () => false,
  );
  controller.setSession(session);
  const add = () =>
    data.views.push({
      id: crypto.randomUUID(),
      groupId,
      sequence: data.views.length + 1,
      epoch: 1,
      hash: 'a'.repeat(64),
      sender: session.accountId,
      own: true,
      kind: 'text',
      text: 'Synthetic',
      unavailableMedia: [],
    });
  return {
    controller,
    data,
    session,
    add,
    groupId,
    Synchronization: context.groups!.MessageSynchronization,
    Visits: context.groups!.ConnectedConversationVisits,
  };
}
