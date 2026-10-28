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
import { dmComposerGate } from '../../src/client/communities/dm-chat.ts';
import type { startDmComposer } from '../../src/client/communities/dm-composer.ts';
import type { AttachmentSelection } from '../../src/client/attachments/index.ts';

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
  '../chat-ui/index.ts': [
    'historyPosition',
    'resetHistoryPosition',
    'watchOlderHistory',
  ],
  './elements.ts': ['communityElement'],
};
const composerAdapters: Record<string, string[]> = {
  '../chat-ui/index.ts': [
    'bindChatComposer',
    'bindRecordGesture',
    'showRecording',
    'updateChatComposer',
  ],
  '../emoji/index.ts': ['EmojiPicker', 'emojiIntoComposer'],
  '../voice-recording/index.ts': ['VoiceRecording'],
  '../gif-search/index.ts': ['GifSearch', 'mountGifPane'],
  '../file-drop/index.ts': ['dropFilesInto'],
  '../social-media/index.ts': ['prepareSocialImage'],
  '../toast/index.ts': ['showToast'],
};
const bundle = await build({
  stdin: {
    contents: `export { startSocialDmUi } from './${entry}'; export { startDmComposer } from './src/client/communities/dm-composer.ts'; export { WorkInterruption } from './src/client/synchronization-work/index.ts';`,
    resolveDir: process.cwd(),
    loader: 'ts',
  },
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
          if (
            (importer.endsWith('/' + entry) ||
              importer.endsWith('/client/communities/dm-history.ts') ||
              importer.endsWith('/client/communities/dm-window.ts')) &&
            adapted[path]
          )
            return { path, namespace: 'fixture' };
          if (
            importer.endsWith('/client/communities/dm-composer.ts') &&
            composerAdapters[path]
          )
            return { path, namespace: 'composer-fixture' };
        });
        builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({
          contents: adapted[path]!.map(
            (name) => `export const ${name} = fixture.${name};`,
          ).join('\n'),
          loader: 'js',
        }));
        builder.onLoad(
          { filter: /.*/, namespace: 'composer-fixture' },
          ({ path }) => ({
            contents: composerAdapters[path]!.map(
              (name) => `export const ${name} = fixture.${name};`,
            ).join('\n'),
            loader: 'js',
          }),
        );
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
  getClientRects(): object[] {
    return this.hidden ? [] : [{}];
  }
  focus() {}
  get firstChild() {
    return this.children[0] ?? null;
  }
  get nextSibling(): CommunityNode | null {
    return (
      this.parent?.children[this.parent.children.indexOf(this) + 1] ?? null
    );
  }
  insertBefore(node: DmNode, before: DmNode | null): void {
    if (node === before) return;
    node.remove();
    node.parent = this;
    const index = before ? this.children.indexOf(before) : this.children.length;
    this.children.splice(index, 0, node);
  }
  override querySelectorAll(selector: string): DmNode[] {
    const attribute = /^\[data-([a-z-]+)\]$/u.exec(selector)?.[1];
    if (!attribute) return super.querySelectorAll(selector) as DmNode[];
    const key = attribute.replace(/-([a-z])/gu, (_match, letter: string) =>
      letter.toUpperCase(),
    );
    return (this.children as DmNode[]).flatMap((node) => [
      ...(key in node.dataset ? [node] : []),
      ...node.querySelectorAll(selector),
    ]);
  }
}
export function dmCoordinatorFixture(t: TestContext, realComposer = false) {
  const calls: string[] = [],
    held = deferred<unknown>();
  const priorities: {
    operation: string;
    priority: VaultWorkOptions['priority'];
  }[] = [];
  let hold = false;
  let cancellations = 0;
  let readFailure: Error | null = null;
  let mediaPeer: string | null = null;
  const media = deferred<boolean>();
  const composerStates: { pending: boolean }[] = [];
  let emit: (event: LiveEvent) => void = () => {};
  let liveChanged: () => void = () => {};
  let liveCurrent = true,
    connecting = false,
    connected = true,
    holdList = false;
  type Page = Awaited<ReturnType<SocialDms['cached']>>;
  const data = {
    items: [] as Page['items'],
    /** Rows of this device's copy below the latest page, oldest first. */
    olderItems: [] as Page['items'],
    next: null as number | null,
    readAfters: [] as (number | null)[],
    cachedBefores: [] as (number | null)[],
    /** The scroll trigger the open conversation registered. */
    older: null as {
      available: () => boolean;
      load: () => Promise<boolean>;
    } | null,
    pending: null as { id: string; text: string } | null,
    mediaPending: false,
    sendFailure: null as Error | null,
    blocked: false,
    sends: [] as { peer: string; text: string; id: string }[],
    bubbles: [] as { row: DmNode; signal: AbortSignal; stopped: boolean }[],
    menus: [] as { react?: unknown; edit?: unknown; stopped: boolean }[],
    revokedUrls: [] as string[],
    selected: null as AttachmentSelection | null,
    streamStops: 0,
    playbackClosed: 0,
  };
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
    form: DmNode;
    text: DmNode;
  }[] = [];
  const noop = () => {},
    asyncNoop = () => Promise.resolve();
  const page = () => ({
    items: data.items,
    next: data.next,
    reactionReads: [],
    self: 'self',
  });
  const document = Object.assign(new EventTarget(), {
    visibilityState: 'visible',
    createElement: (tag: string) => new DmNode(tag),
    // Menu glyphs are real SVG nodes; the fixture only needs their structure.
    createElementNS: (_namespace: string, tag: string) => new DmNode(tag),
  });
  const window = new EventTarget();
  let record: {
    active: boolean;
    start: () => Promise<void>;
    cancel: () => void;
  };
  const fixture = {
    SocialDms: function () {
      // Keep the actual session/cancellation guards and signed list transport.
      return Object.assign(new SocialDms(access, new VaultSync(access)), {
        cancel: () => {
          cancellations++;
        },
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
                canSend: !data.blocked,
                blocked: data.blocked,
              });
        },
        read: (
          peer: string,
          before: number | null,
          options: VaultWorkOptions = {},
        ) => {
          priorities.push({ operation: 'read', priority: options.priority });
          calls.push('read:' + peer);
          data.readAfters.push(before);
          return readFailure
            ? Promise.reject(readFailure)
            : Promise.resolve(page());
        },
        cached: (peer: string, before: number | null) => {
          calls.push('cached:' + peer);
          data.cachedBefores.push(before);
          return Promise.resolve(
            before === null
              ? page()
              : {
                  ...page(),
                  items: data.olderItems
                    .filter((item) => item.sequence < before)
                    .slice(-16),
                },
          );
        },
        pending: () => Promise.resolve(data.pending),
        send: (peer: string, text: string, id: string) => {
          data.sends.push({ peer, text, id });
          data.pending = { id, text };
          if (data.sendFailure) return Promise.reject(data.sendFailure);
          data.pending = null;
          return Promise.resolve();
        },
        stageMedia: () => {
          calls.push('stage-media');
          data.mediaPending = true;
          return Promise.resolve();
        },
        sendMedia: () => {
          calls.push('send-media');
          if (data.sendFailure) return Promise.reject(data.sendFailure);
          data.mediaPending = false;
          return Promise.resolve();
        },
        mediaDraft: (peer: string) => {
          calls.push('media:' + peer);
          return peer === mediaPeer
            ? media.promise
            : Promise.resolve(data.mediaPending);
        },
        directoryPreviews: () => Promise.resolve(new Map()),
        messageStates: () => Promise.resolve([]),
        markRead: asyncNoop,
        copies: () => Promise.resolve({ items: [], next: null }),
      });
    },
    VoicePlayback: function () {
      return {
        close: () => {
          data.playbackClosed++;
        },
        release: noop,
      };
    },
    AttachmentUi: function () {
      return { clearMedia: noop };
    },
    EmojiPicker: function () {
      return { reset: noop };
    },
    bindChatComposer: noop,
    bindRecordGesture: noop,
    showRecording: noop,
    updateChatComposer: noop,
    emojiIntoComposer: asyncNoop,
    GifSearch: function () {},
    mountGifPane: noop,
    dropFilesInto: noop,
    prepareSocialImage: () =>
      Promise.resolve({ selection: data.selected, media: 'photo' }),
    showToast: noop,
    VoiceRecording: function (options: { changed: (state: unknown) => void }) {
      record = {
        active: false,
        start: () => {
          record.active = true;
          options.changed({ phase: 'recording' });
          return Promise.resolve();
        },
        cancel: () => {
          record.active = false;
          options.changed({ phase: 'idle' });
        },
      };
      return record;
    },
    startDmComposer: (options: Parameters<typeof startDmComposer>[0]) =>
      realComposer
        ? context.startDmComposer(options)
        : {
            active: false,
            unsent: false,
            editing: null,
            bind: noop,
            update: (state: { pending: boolean }) =>
              composerStates.push({ ...state }),
            restoreDraft: noop,
            leave: noop,
            cancelEdit: noop,
            forgetDrafts: noop,
          },
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
        get connected() {
          return connected;
        },
        start: noop,
        stop: () => {
          data.streamStops++;
        },
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
      for (const key of [
        'attachmentFile',
        'attachmentPreview',
        'attachmentClear',
      ]) {
        const control = new DmNode(key === 'attachmentFile' ? 'input' : 'div');
        control.dataset[key] = '';
        current.form.append(control);
      }
      current.form.append(current.text);
      current.panel.append(current.history, current.form);
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
    dmComposerGate,
    dmStateLabel: () => '',
    clearDmChecks: noop,
    refreshDmChecks: asyncNoop,
    historyPosition: () => noop,
    resetHistoryPosition: noop,
    watchOlderHistory: (input: NonNullable<typeof data.older>) => {
      data.older = input;
      return { check: noop };
    },
    dmBubble: (
      item: { id: string; text: string },
      input: { signal: AbortSignal },
    ) => {
      const row = new DmNode('article');
      row.dataset['message'] = item.id;
      row.textContent = item.text;
      const bubble = { row, signal: input.signal, stopped: false };
      data.bubbles.push(bubble);
      return {
        row,
        stop: () => {
          bubble.stopped = true;
        },
      };
    },
    dmListView: (host: DmNode) => {
      const list = new DmNode();
      host.replaceChildren(list);
      return list;
    },
    dmMessageMenu: (
      _row: DmNode,
      input: { react?: unknown; edit?: unknown },
    ) => {
      const menu = { ...input, stopped: false };
      data.menus.push(menu);
      return () => {
        menu.stopped = true;
      };
    },
    dmReactionChips: noop,
  };
  const context = runInNewContext(bundle.outputFiles[0]!.text + '\ndmUi;', {
    fixture,
    console,
    performance,
    crypto,
    TextDecoder,
    TextEncoder,
    AbortController,
    AbortSignal,
    DOMException,
    Error,
    Blob,
    Event,
    URL: {
      createObjectURL: () => 'blob:synthetic',
      revokeObjectURL: (url: string) => data.revokedUrls.push(url),
    },
    matchMedia: () => ({ matches: false }),
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    document,
    window,
    navigator: { onLine: true },
    HTMLElement: DmNode,
  }) as {
    startSocialDmUi: typeof startSocialDmUi;
    startDmComposer: typeof startDmComposer;
    WorkInterruption: typeof import('../../src/client/synchronization-work/index.ts').WorkInterruption;
  };
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
    data,
    startRecording: () => record.start(),
    cancelRecording: () => record.cancel(),
    chooseImage: (selection: AttachmentSelection) => {
      data.selected = selection;
      const input = views.at(-1)!.form.querySelector('[data-attachment-file]')!;
      Object.assign(input, { files: [{}] });
      input.dispatchEvent(new Event('change'));
    },
    disconnect: () => {
      connected = false;
    },
    host: host as unknown as HTMLElement,
    calls,
    priorities,
    composerStates,
    holdMedia: (peer: string) => {
      mediaPeer = peer;
    },
    releaseMedia: () => {
      mediaPeer = null;
      media.resolve(true);
    },
    get cancellations() {
      return cancellations;
    },
    continuation: () => new context.WorkInterruption('continuation'),
    failRead: (error: Error) => {
      readFailure = error;
    },
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
