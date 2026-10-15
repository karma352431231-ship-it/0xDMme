import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import type { TestContext } from 'node:test';
import type { startMessages } from '../../src/client/messages/index.ts';
import type { AccountSession } from '../../src/shared/account/index.ts';
import type { MessageView } from '../../src/client/messages/controller.ts';
import type { LiveEvent } from '../../src/client/message-live/index.ts';
import type { VaultAccess } from '../../src/client/vault-authority/index.ts';
import type { VaultSync } from '../../src/client/vault-sync/index.ts';
import { deferred } from './deferred.ts';

// Real screen coordinator, scheduling, startup and wakeups. IO, media and DOM
// projection are adapters; crypto and durable reuse have controller regressions.
const entry = 'src/client/messages/index.ts';
const source = await readFile(entry, 'utf8');
const exports = new Map<string, string[]>();
for (const match of source.matchAll(
  /import \{([\s\S]*?)\} from '([^']+)';/gu,
)) {
  exports.set(
    match[2]!,
    match[1]!
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean),
  );
}
const real = new Set([
  './synchronization.ts',
  './startup.ts',
  './continuity.ts',
]);
const bundle = await build({
  entryPoints: [entry],
  bundle: true,
  write: false,
  platform: 'browser',
  format: 'iife',
  globalName: 'coordinator',
  plugins: [
    {
      name: 'message-screen-adapters',
      setup(builder) {
        builder.onResolve({ filter: /.*/ }, ({ path, importer }) => {
          if (path === '../message-runtime/index.ts')
            return { path, namespace: 'fixture' };
          if (
            !importer.endsWith('/src/client/messages/index.ts') ||
            real.has(path)
          )
            return;
          if (exports.has(path)) return { path, namespace: 'fixture' };
        });
        builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({
          contents:
            path === '../message-runtime/index.ts'
              ? 'export const prepareMessageRuntime = () => Promise.resolve();'
              : exports
                  .get(path)!
                  .map((name) => `export const ${name} = fixture.${name};`)
                  .join('\n'),
          loader: 'js',
        }));
      },
    },
  ],
});

export function coordinatorFixture(t: TestContext) {
  const calls: string[] = [];
  const page = deferred<boolean>();
  const state = {
    visibilityState: 'visible',
    holdPage: false,
    liveCurrent: true,
    liveConnected: true,
    groupVisible: false,
    groupPending: false,
    probeChanged: false,
    signals: [] as AbortSignal[],
  };
  let emit: (event: LiveEvent) => void = () => {};
  let lose: () => void = () => {};
  let lifecycle: {
    visibility: () => void;
    freeze: () => void;
    resume: () => void;
    tick: () => Promise<void>;
    pageHide: (event: { persisted: boolean }) => void;
  };
  let publish: (rows: MessageView[] | null) => void = () => {};
  const noop = () => {};
  const asyncNoop = () => Promise.resolve();
  const base = {
    close: noop,
    reset: noop,
    clear: noop,
    render: noop,
    status: noop,
    setSession: noop,
    observe: noop,
    prepare: noop,
    bind: noop,
    mount: noop,
    resume: noop,
    cancel: noop,
  };
  const fixture: Record<string, unknown> = {};
  for (const names of exports.values())
    for (const name of names) fixture[name] = noop;
  for (const name of [
    'ContactDirectory',
    'ConversationMenu',
    'EmojiPicker',
    'ConversationSearch',
    'AttachmentUi',
    'VoiceRecording',
    'MessageHistoryUi',
    'MessageDirectoryUi',
    'NotificationSound',
    'ExternalTextHistory',
    'GifSearch',
    'Contacts',
    'PeerPhotos',
    'ProfileBroadcast',
    'ConversationPreviewLoader',
  ]) {
    fixture[name] = function () {
      return {
        ...base,
        active: false,
        selected: null,
        state: { phase: 'idle' },
        ids: [],
        values: new Map(),
        refresh: asyncNoop,
        more: false,
        renderContacts: noop,
        pause: noop,
        clearMedia: noop,
        clearSelection: noop,
        pausePreview: noop,
        markRead: () => {
          calls.push('read');
          return Promise.resolve();
        },
        setBusy: noop,
        unlock: noop,
        show: noop,
        run: asyncNoop,
        dispose: asyncNoop,
      };
    };
  }
  fixture.MessageDirectory = function (options: {
    changed: (peers: unknown[]) => void;
  }) {
    return {
      ...base,
      peers: [],
      hasMore: () => false,
      refresh: () => {
        calls.push('contacts');
        options.changed([]);
        return Promise.resolve();
      },
    };
  };
  fixture.Messages = function (
    _access: unknown,
    _sync: unknown,
    callback: typeof publish,
  ) {
    publish = callback;
    return {
      ...base,
      pause: () => {
        calls.push('pause');
        publish(null);
      },
      removed: () => {
        calls.push('removed');
        publish(null);
      },
      hide: () => {
        calls.push('hide');
        publish(null);
      },
      hint: () => calls.push('hint'),
      pauseSynchronization: () => calls.push('abort-direct'),
      initialize: () => {
        calls.push('initialize');
        return Promise.resolve();
      },
      loadPins: () => {
        calls.push('pins');
        return Promise.resolve();
      },
      savePins: asyncNoop,
      probe: () => {
        calls.push('probe');
        return Promise.resolve(state.probeChanged);
      },
      synchronize: () => {
        calls.push('synchronize');
        return Promise.resolve();
      },
      pending: () => Promise.resolve([]),
      sendPending: asyncNoop,
      synchronizeAll: (signal: AbortSignal) => {
        calls.push('preload');
        state.signals.push(signal);
        return state.holdPage ? page.promise : Promise.resolve(false);
      },
      select: noop,
      knownProfile: () => Promise.resolve(null),
    };
  };
  fixture.startGroups = () => ({
    ...base,
    entries: [],
    selected: null,
    next: null,
    removed: () => calls.push('groups-removed'),
    suspend: () => calls.push('suspend-groups'),
    deselect: noop,
    pauseSynchronization: noop,
    refresh: asyncNoop,
    pendingWork: () => Promise.resolve(state.groupPending),
    resumePending: () => {
      calls.push('group-retry');
      return Promise.resolve();
    },
    synchronizeAll: () => Promise.resolve(false),
    setStates: noop,
  });
  fixture.Daily = function () {
    return {
      ...base,
      configure: asyncNoop,
      heartbeat: () => {
        calls.push('heartbeat');
        return Promise.resolve();
      },
      states: () => {
        calls.push('states');
        return Promise.resolve(new Map());
      },
      loadSettings: asyncNoop,
    };
  };
  fixture.LiveMessages = function (options: {
    event: typeof emit;
    changed: () => void;
  }) {
    const live = {
      get connected() {
        return state.liveConnected;
      },
      get current() {
        return state.liveCurrent;
      },
      connecting: false,
      start: () => {
        calls.push('live-start');
      },
      stop: () => {
        calls.push('live-stop');
        state.liveCurrent = false;
        state.liveConnected = false;
        options.changed();
      },
      retry: () => {
        live.stop();
        live.start();
      },
    };
    lose = () => {
      state.liveCurrent = false;
      state.liveConnected = false;
      options.changed();
    };
    emit = (event) => {
      if (event === 'ready') {
        state.liveCurrent = true;
        state.liveConnected = true;
        options.changed();
      }
      options.event(event);
    };
    return live;
  };
  fixture.bindMessageLifecycle = (value: typeof lifecycle) => {
    lifecycle = value;
    return noop;
  };
  const panel = {
    isConnected: true,
    hidden: false,
    dataset: {},
    innerHTML: '',
    getClientRects: () => [{}],
    addEventListener: noop,
    querySelectorAll: () => [],
    querySelector: (selector: string) =>
      ['.chat-panel', '[data-direct-conversation]'].includes(selector) ||
      (selector === '[data-group-conversation]' && state.groupVisible)
        ? panel
        : null,
  };
  const context = {
    fixture,
    coordinator: undefined as
      { startMessages: typeof startMessages } | undefined,
    document: Object.assign(state, { addEventListener: noop }),
    window: { addEventListener: noop },
    navigator: { onLine: true },
    Date,
    AbortController,
    AbortSignal,
    setTimeout,
    clearTimeout,
  };
  runInNewContext(bundle.outputFiles[0]!.text, context);
  if (!context.coordinator) throw new Error('Coordenador ausente.');
  const messages = context.coordinator.startMessages(
    {} as VaultAccess,
    {} as VaultSync,
    {
      playback: {
        open: false,
        close: noop,
        check: asyncNoop,
      } as unknown as Parameters<typeof startMessages>[2]['playback'],
      openConversation: noop,
      openContact: noop,
      directoryChanged: noop,
      sharedProfile: () => null,
      preferences: () => null,
    },
  );
  messages.mount(
    panel as unknown as HTMLElement,
    panel as unknown as HTMLElement,
  );
  messages.setSession({
    accountId: 'synthetic',
    deviceId: 'device',
    csrf: 'synthetic',
  } as AccountSession);
  t.after(() => lifecycle.pageHide({ persisted: false }));
  return {
    messages,
    state,
    calls,
    page,
    emit: (event: LiveEvent) => emit(event),
    lose: () => lose(),
    tick: () => lifecycle.tick(),
    freeze: () => lifecycle.freeze(),
    resume: () => lifecycle.resume(),
    visibility: (value: string) => {
      state.visibilityState = value;
      lifecycle.visibility();
    },
  };
}
