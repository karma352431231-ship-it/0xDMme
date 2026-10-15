import { build } from 'esbuild';
import { runInNewContext } from 'node:vm';
import type { TestContext } from 'node:test';
import type { startSocialDmUi } from '../../src/client/communities/dms.ts';
import type { LiveEvent } from '../../src/client/message-live/index.ts';
import { CommunityNode } from './community-dom.ts';
import { deferred } from './deferred.ts';

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
    'dmRequestState',
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
  let hold = false;
  let emit: (event: LiveEvent) => void = () => {};
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
  });
  const window = new EventTarget();
  const fixture = {
    SocialDms: function () {
      return {
        setSession: noop,
        cancel: noop,
        initialize: () => {
          calls.push('initialize');
          return Promise.resolve('self');
        },
        state: (peer: string) => {
          calls.push('state:' + peer);
          return hold
            ? held.promise
            : Promise.resolve({
                peer: { id: peer, handle: peer, avatar: null },
                canSend: true,
              });
        },
        read: (peer: string) => {
          calls.push('read:' + peer);
          return Promise.resolve(page());
        },
        cached: () => Promise.resolve(page()),
        pending: () => Promise.resolve(null),
        mediaDraft: () => Promise.resolve(false),
      };
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
    LiveMessages: function (options: { event: typeof emit }) {
      emit = options.event;
      return {
        current: true,
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
    dmRequestState: () => null,
    dmStateLabel: () => '',
    clearDmChecks: noop,
    refreshDmChecks: asyncNoop,
    historyPosition: () => noop,
    resetHistoryPosition: noop,
    dmBubble: noop,
    dmListView: noop,
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
  ui.setSession({
    accountId: 'account',
    deviceId: 'device',
    csrf: 'csrf',
  } as Parameters<typeof ui.setSession>[0]);
  const host = new DmNode();
  t.after(() => ui.leave());
  return {
    ui,
    host: host as unknown as HTMLElement,
    calls,
    views,
    emit: (event: LiveEvent) => emit(event),
    hold: () => {
      hold = true;
    },
    release: (peer: string) => {
      hold = false;
      held.resolve({
        peer: { id: peer, handle: peer, avatar: null },
        canSend: true,
      });
    },
    window,
    document,
  };
}
