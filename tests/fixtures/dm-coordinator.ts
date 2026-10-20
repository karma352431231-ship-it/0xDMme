import { build } from 'esbuild';
import { runInNewContext } from 'node:vm';
import type { TestContext } from 'node:test';
import type { startSocialDmUi } from '../../src/client/communities/dms.ts';
import type { LiveEvent } from '../../src/client/message-live/index.ts';
import { CommunityNode } from './community-dom.ts';
import { deferred } from './deferred.ts';
import { SocialDms } from '../../src/client/social-dm/index.ts';
import { VaultSync } from '../../src/client/vault-sync/index.ts';
import type {
  VaultAccess,
  VaultAuthority,
  VaultWorkOptions,
} from '../../src/client/vault-authority/index.ts';
import type { AccountSession } from '../../src/shared/account/index.ts';

const entry = 'src/client/communities/dms.ts';
// Real coordinator, queue, lifecycle and wakeup coalescing; IO and DOM are adapters.
const adapted: Record<string, string[]> = {
  '../social-dm/index.ts': ['SocialDms'],
  '../voice-playback/index.ts': ['VoicePlayback'],
  '../attachment-ui/index.ts': ['AttachmentUi'],
  '../emoji/index.ts': ['EmojiPicker'],
  './dm-composer.ts': ['startDmComposer'],
  './dm-chat.ts': [
    'dmBubble',
    'dmConversationView',
    'dmListView',
    'dmComposerGate',
    'dmStateLabel',
    'paintDmPeer',
  ],
  './dm-checks.ts': ['clearDmChecks', 'refreshDmChecks'],
  './dm-message-menu.ts': ['dmMessageMenu', 'dmReactionChips'],
  '../chat-ui/index.ts': ['historyPosition', 'resetHistoryPosition'],
  './elements.ts': ['communityElement'],
};
const bundle = await build({
  entryPoints: [entry],
  bundle: true,
  write: false,
  platform: 'browser',
  format: 'iife',
  globalName: 'dmUi',
  plugins: [
    {
      name: 'dm-screen-adapters',
      setup(builder) {
        builder.onResolve({ filter: /.*/ }, ({ path, importer }) => {
          if (importer.endsWith('/' + entry) && adapted[path])
            return { path, namespace: 'fixture' };
        });
        builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({
          contents: adapted[path]!.map(
            (name) => `export const ${name} = fixture.${name};`,
          ).join('\n'),
          loader: 'js',
        }));
        // Keep real LiveUpdates but adapt the stream's transport.
        builder.onLoad(
          { filter: /src\/client\/message-live\/index\.ts$/ },
          async () => {
            const { readFile } = await import('node:fs/promises');
            const source = await readFile(
              'src/client/message-live/index.ts',
              'utf8',
            );
            return {
              contents:
                source.replace(
                  'export class LiveMessages {',
                  'class RealLiveMessages {',
                ) + '\nexport const LiveMessages = fixture.LiveMessages;',
              loader: 'ts',
            };
          },
        );
      },
    },
  ],
});

class DmNode extends CommunityNode {
  isConnected = true;
  focus() {}
  get firstChild() {
    return this.children[0] ?? null;
  }
}
export function dmCoordinatorFixture(t: TestContext) {
  const calls: string[] = [],
    held = deferred<unknown>();
  const priorities: {
    operation: string;
    priority: VaultWorkOptions['priority'];
  }[] = [];
  let hold = false;
  let emit: (event: LiveEvent) => void = () => {};
  let liveChanged: () => void = () => {};
  let liveCurrent = true,
    connecting = false,
    holdList = false;
  const listing = deferred<Response>();
  const session: AccountSession = {
    accountId: crypto.randomUUID(),
    deviceId: crypto.randomUUID(),
    csrf: 'a'.repeat(64),
    name: 'Synthetic',
    address: `0x${'1'.repeat(40)}`,
    ecosystem: 'evm',
    deviceState: 'pending',
    historyAuthorized: false,
    expiresAt: new Date(Date.now() + 60000).toISOString(),
    profileRevision: 0,
  };
  const authority: VaultAuthority = {
    session,
    offline: false,
    directory: 'b'.repeat(64),
    epoch: 1,
    events: [],
    sign: () => Promise.resolve('a'.repeat(88)),
    key: () =>
      Promise.reject(new Error('No crypto key in the transport fixture.')),
  };
  const access: VaultAccess = {
    withVault: (_offline, work) => work(authority),
    withLocalVault: (_locator, work) => work(authority),
  };
  t.mock.method(globalThis, 'fetch', (url: string | URL | Request) => {
    if (
      (url instanceof Request ? url.url : String(url)) !==
      '/api/account/messages/dm-list'
    )
      throw new Error('Unexpected DM fixture request.');
    calls.push('list');
    return holdList
      ? listing.promise
      : Promise.resolve(Response.json({ items: [], next: null }));
  });
  const views: {
    history: DmNode;
    gate: DmNode;
    older: DmNode;
    title: DmNode;
  }[] = [];
  const noop = () => {},
    asyncNoop = () => Promise.resolve();
  const page = () => ({
    items: [],
    next: null,
    reactionReads: [],
    self: 'self',
  });
  const document = Object.assign(new EventTarget(), {
    visibilityState: 'visible',
    // Menu glyphs are real SVG nodes; the fixture only needs their structure.
    createElementNS: (_namespace: string, tag: string) => new DmNode(tag),
  });
  const window = new EventTarget();
  const fixture = {
    SocialDms: function () {
      // Keep the actual session/cancellation guards and signed list transport.
      return Object.assign(new SocialDms(access, new VaultSync(access)), {
        initialize: (options: VaultWorkOptions = {}) => {
          priorities.push({
            operation: 'initialize',
            priority: options.priority,
          });
          calls.push('initialize');
          return Promise.resolve('self');
        },
        state: (peer: string, options: VaultWorkOptions = {}) => {
          priorities.push({ operation: 'state', priority: options.priority });
          calls.push('state:' + peer);
          return hold
            ? held.promise
            : Promise.resolve({
                peer: { id: peer, handle: peer, avatar: null },
                state: 'approved',
                canSend: true,
              });
        },
        read: (
          peer: string,
          _before: number | null,
          options: VaultWorkOptions = {},
        ) => {
          priorities.push({ operation: 'read', priority: options.priority });
          calls.push('read:' + peer);
          return Promise.resolve(page());
        },
        cached: () => Promise.resolve(page()),
        pending: () => Promise.resolve(null),
        mediaDraft: () => Promise.resolve(false),
        directoryPreviews: () => Promise.resolve(new Map()),
        copies: () => Promise.resolve({ items: [], next: null }),
      });
    },
    VoicePlayback: function () {
      return { close: noop };
    },
    AttachmentUi: function () {
      return { clearMedia: noop };
    },
    EmojiPicker: function () {
      return { reset: noop };
    },
    startDmComposer: () => ({
      active: false,
      editing: null,
      bind: noop,
      update: noop,
      restoreDraft: noop,
      leave: noop,
      cancelEdit: noop,
    }),
    LiveMessages: function (options: {
      event: typeof emit;
      changed: () => void;
    }) {
      emit = options.event;
      liveChanged = options.changed;
      return {
        get current() {
          return liveCurrent;
        },
        get connecting() {
          return connecting;
        },
        connected: true,
        start: noop,
        stop: noop,
        retry: noop,
      };
    },
    communityElement: (tag: string, text = '') => {
      const node = new DmNode(tag);
      node.textContent = text;
      return node;
    },
    dmConversationView: (host: DmNode) => {
      const current = {
        panel: new DmNode(),
        avatar: new DmNode('button'),
        title: new DmNode(),
        state: new DmNode(),
        options: new DmNode(),
        gate: new DmNode(),
        older: new DmNode('button'),
        history: new DmNode(),
        request: new DmNode(),
        form: new DmNode('form'),
        text: new DmNode('textarea'),
      };
      host.replaceChildren(current.panel);
      views.push(current);
      return current;
    },
    paintDmPeer: (
      view: { title: DmNode },
      input: { profile: { handle: string } },
    ) => {
      view.title.textContent = input.profile.handle;
    },
    dmComposerGate: () => null,
    dmStateLabel: () => '',
    clearDmChecks: noop,
    refreshDmChecks: asyncNoop,
    historyPosition: () => noop,
    resetHistoryPosition: noop,
    dmBubble: noop,
    dmListView: (host: DmNode) => {
      const list = new DmNode();
      host.replaceChildren(list);
      return list;
    },
    dmMessageMenu: noop,
    dmReactionChips: noop,
  };
  const context = runInNewContext(bundle.outputFiles[0]!.text + '\ndmUi;', {
    fixture,
    console,
    crypto,
    TextDecoder,
    TextEncoder,
    AbortController,
    AbortSignal,
    DOMException,
    Error,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    document,
    window,
    navigator: { onLine: true },
    HTMLElement: DmNode,
  }) as { startSocialDmUi: typeof startSocialDmUi };
  const ui = context.startSocialDmUi(
    {} as Parameters<typeof startSocialDmUi>[0],
    {} as Parameters<typeof startSocialDmUi>[1],
    {} as Parameters<typeof startSocialDmUi>[2],
  );
  ui.setSession(session);
  const host = new DmNode();
  t.after(() => ui.leave());
  return {
    ui,
    host: host as unknown as HTMLElement,
    calls,
    priorities,
    visibility: (value: 'visible' | 'hidden') => {
      document.visibilityState = value;
      document.dispatchEvent(new Event('visibilitychange'));
    },
    views,
    emit: (event: LiveEvent) => emit(event),
    changeLive: (current: boolean, handshake = false) => {
      liveCurrent = current;
      connecting = handshake;
      liveChanged();
    },
    holdList: () => {
      holdList = true;
    },
    releaseList: (response = Response.json({ items: [], next: null })) => {
      holdList = false;
      listing.resolve(response);
    },
    hold: () => {
      hold = true;
    },
    release: (peer: string) => {
      hold = false;
      held.resolve({
        peer: { id: peer, handle: peer, avatar: null },
        state: 'approved',
        canSend: true,
      });
    },
    window,
    document,
  };
}
