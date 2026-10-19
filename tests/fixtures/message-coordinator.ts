import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import type { TestContext } from 'node:test';
import type { startMessages } from '../../src/client/messages/index.ts';
import type { AccountSession } from '../../src/shared/account/index.ts';
import type { MessageView } from '../../src/client/messages/controller.ts';
import type { LiveEvent } from '../../src/client/message-live/index.ts';
import type { VaultWorkOptions } from '../../src/client/vault-authority/index.ts';
import type { VaultAccess } from '../../src/client/vault-authority/index.ts';
import type { VaultSync } from '../../src/client/vault-sync/index.ts';
import { deferred } from './deferred.ts';
import { updateChatComposer } from '../../src/client/chat-ui/index.ts';
import { encodeDailyText } from '../../src/shared/daily/index.ts';

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
  './warmup.ts',
  './text-send.ts',
  './outgoing-text.ts',
  './profile-broadcast.ts',
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
  const directoryWork: VaultWorkOptions[] = [];
  const priorities: {
    operation: string;
    priority: 'interactive' | undefined;
  }[] = [];
  const page = deferred<boolean>();
  const initialization = deferred<void>();
  const groupLoad = deferred<void>();
  const contactLoad = deferred<void>();
  const history = deferred<void>();
  const saving = deferred<void>();
  const sending = deferred<void>();
  const profile = deferred<void>();
  const drafts: { id: string; peer: string; text: string }[] = [];
  const state = {
    visibilityState: 'visible',
    holdPage: false,
    holdInitialization: false,
    holdGroups: false,
    holdContacts: false,
    holdHistory: false,
    holdSave: false,
    holdSend: false,
    withProfile: false,
    holdProfile: false,
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
    preferences: () => void;
    tick: () => Promise<void>;
    pageHide: (event: { persisted: boolean }) => void;
    pageShow: (event: { persisted: boolean }) => void;
  };
  let publish: (rows: MessageView[] | null) => void = () => {};
  let clickPeer: (
    peer: Parameters<ReturnType<typeof startMessages>['openContact']>[0],
  ) => void = () => {};
  const noop = () => {};
  const asyncNoop = () => Promise.resolve();
  const base = {
    close: noop,
    leave: noop,
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
    'MessageDirectoryUi',
    'NotificationSound',
    'ExternalTextHistory',
    'GifSearch',
    'Contacts',
    'PeerPhotos',
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
  fixture.MessageHistoryUi = function (options: {
    composerChanged: () => void;
  }) {
    return {
      ...base,
      render: () => options.composerChanged(),
      clearMedia: noop,
      markRead: () => {
        calls.push('read');
        return Promise.resolve();
      },
    };
  };
  fixture.MessageDirectory = function (options: {
    changed: (peers: unknown[]) => void;
  }) {
    return {
      ...base,
      peers: [],
      hasMore: () => false,
      refresh: (
        _more: boolean | undefined,
        _online: boolean | undefined,
        work: VaultWorkOptions = {},
      ) => {
        directoryWork.push(work);
        calls.push('contacts');
        options.changed([]);
        return state.holdContacts ? contactLoad.promise : Promise.resolve();
      },
    };
  };
  fixture.MessageDirectoryUi = function (options: {
    openPeer: typeof clickPeer;
  }) {
    clickPeer = options.openPeer;
    return {
      ...base,
      renderContacts: noop,
      pause: noop,
      openingPeer: (peer: string) => {
        calls.push('opening:' + peer);
        return noop;
      },
    };
  };
  fixture.updateChatComposer = updateChatComposer;
  fixture.encodeDailyText = encodeDailyText;
  fixture.Messages = function (
    _access: unknown,
    _sync: unknown,
    callback: typeof publish,
    published: (value: { id: string; peer: string }) => void,
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
        return state.holdInitialization
          ? initialization.promise
          : Promise.resolve();
      },
      loadPins: (options: VaultWorkOptions = {}) => {
        priorities.push({ operation: 'pins', priority: options.priority });
        calls.push('pins');
        return Promise.resolve();
      },
      savePins: asyncNoop,
      shareProfile: (peer: string) => {
        calls.push('profile:' + peer);
        return state.holdProfile ? profile.promise : Promise.resolve();
      },
      probe: (options: VaultWorkOptions = {}) => {
        priorities.push({ operation: 'probe', priority: options.priority });
        calls.push('probe');
        return Promise.resolve(state.probeChanged);
      },
      synchronize: (options: VaultWorkOptions = {}) => {
        priorities.push({
          operation: 'synchronize',
          priority: options.priority,
        });
        calls.push('synchronize');
        if (state.holdHistory) return history.promise.then(() => publish([]));
        return Promise.resolve().then(() => publish([]));
      },
      compose: (peer: string) => {
        calls.push('compose:' + peer);
        return Promise.resolve();
      },
      pending: () => Promise.resolve([]),
      queueText: async (draft: { id: string; peer: string; text: string }) => {
        if (state.holdSave) await saving.promise;
        drafts.push(draft);
        calls.push('compose:' + draft.peer);
      },
      sendPending: async (options: VaultWorkOptions = {}) => {
        priorities.push({ operation: 'send', priority: options.priority });
        calls.push('send-pending');
        if (state.holdSend) await sending.promise;
        for (const draft of drafts.splice(0, 16)) published(draft);
      },
      synchronizeAll: (signal: AbortSignal) => {
        calls.push('preload');
        state.signals.push(signal);
        return state.holdPage ? page.promise : Promise.resolve(false);
      },
      select: (peer: string | null) => {
        calls.push('select:' + String(peer));
        publish(null);
      },
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
    refresh: () => {
      calls.push('groups');
      return state.holdGroups ? groupLoad.promise : Promise.resolve();
    },
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
  const input = Object.assign(new EventTarget(), {
    value: 'Synthetic draft',
    disabled: false,
    focus: noop,
  });
  const send = { disabled: true, hidden: false };
  const form = Object.assign(new EventTarget(), {
    dataset: {},
    querySelector: (selector: string) =>
      selector === 'textarea'
        ? input
        : selector === '[data-compose-send]'
          ? send
          : null,
    querySelectorAll: () => [],
  });
  const panel = {
    isConnected: true,
    hidden: false,
    dataset: {},
    innerHTML: '',
    getClientRects: () => [{}],
    addEventListener: noop,
    querySelectorAll: () => [],
    querySelector: (selector: string) =>
      selector === '[data-message-form]'
        ? form
        : selector === '[data-message-text]'
          ? input
          : ['.chat-panel', '[data-direct-conversation]'].includes(selector) ||
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
    Event,
    crypto,
    TextEncoder,
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
      openConversation: () => calls.push('open-panel'),
      openContact: noop,
      directoryChanged: noop,
      sharedProfile: () =>
        state.withProfile
          ? { name: 'Synthetic', revision: 1, photo: null }
          : null,
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
    priorities,
    directoryWork,
    page,
    initialization,
    groupLoad,
    contactLoad,
    history,
    saving,
    sending,
    profile,
    drafts,
    input,
    send,
    submit: () => form.dispatchEvent(new Event('submit', { cancelable: true })),
    clickPeer: (peer: Parameters<typeof clickPeer>[0]) => clickPeer(peer),
    preferences: () => lifecycle.preferences(),
    pageHide: (persisted: boolean) => lifecycle.pageHide({ persisted }),
    pageShow: () => lifecycle.pageShow({ persisted: true }),
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
