import { build } from 'esbuild';
import { runInNewContext } from 'node:vm';
import type { startGroups } from '../../src/client/groups/index.ts';
import type { GroupSummary } from '../../src/client/groups/controller.ts';
import type { GroupView } from '../../src/client/groups/reader.ts';
import type { GroupPhoto } from '../../src/shared/group-messages/index.ts';
import { ChatNode } from './chat-dom.ts';
import type { CommunityNode } from './community-dom.ts';
import { deferred } from './deferred.ts';

// Bundle the real group screen and presentation owners. Replace only domain IO,
// browser media and layout adapters, whose contracts have separate tests.
const adapters: Record<string, string[]> = {
  './controller.ts': ['GroupController'],
  './backup.ts': ['GroupBackups'],
  './notification.ts': ['readGroupNotification'],
  './directory-photo.ts': ['showGroupDirectoryPhoto'],
  '../attachment-ui/index.ts': ['AttachmentUi'],
  '../voice-recording/index.ts': ['VoiceRecording'],
  '../emoji/index.ts': ['EmojiPicker', 'emojiIntoComposer', 'emojiText'],
  '../appearance/index.ts': ['paintAvatar', 'displayName', 'shortAddress'],
  '../contacts/index.ts': ['Contacts'],
  '../external-video/index.ts': ['showExternalVideos'],
  '../gif-search/index.ts': ['showGifText', 'gifUrls'],
  '../chat-ui/index.ts': [
    'chatIcon',
    'ChatHistoryLoading',
    'chatCollapse',
    'chatComposer',
    'bindChatComposer',
    'updateChatComposer',
    'historyPosition',
    'resetHistoryPosition',
    'bindRecordGesture',
    'showRecording',
  ],
};
const bundle = await build({
  entryPoints: ['src/client/groups/index.ts'],
  bundle: true,
  write: false,
  platform: 'browser',
  format: 'iife',
  globalName: 'groups',
  plugins: [
    {
      name: 'group-screen-io',
      setup(builder) {
        builder.onResolve({ filter: /.*/ }, ({ path, importer }) => {
          if (importer.includes('/src/client/') && adapters[path])
            return { path, namespace: 'fixture' };
        });
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

class GroupNode extends ChatNode {
  open = false;
  get isConnected(): boolean {
    return this.tag === 'body' || !!this.parent;
  }
  showModal(): void {
    this.open = true;
  }
  close(): void {
    if (!this.open) return;
    this.open = false;
    this.dispatchEvent(new Event('close'));
  }
  focus(): void {}
  reset(): void {
    this.value = '';
  }
  insertAdjacentHTML(): void {}
  override querySelectorAll(selector: string): CommunityNode[] {
    const selectors = selector.split(',').map((part) => part.trim());
    return this.children.flatMap((child) => [
      ...(selectors.some((part) => matches(child, part)) ? [child] : []),
      ...child.querySelectorAll(selector),
    ]);
  }
}
function matches(node: CommunityNode, selector: string): boolean {
  const attribute = /^\[data-([\w-]+)(?:="([^"]*)")?\]$/u.exec(selector);
  if (attribute) {
    const key = attribute[1]!.replace(/-([a-z])/gu, (_match, letter: string) =>
      letter.toUpperCase(),
    );
    return (
      key in node.dataset &&
      (attribute[2] === undefined || node.dataset[key] === attribute[2])
    );
  }
  return selector.startsWith('.')
    ? node.className.split(' ').includes(selector.slice(1))
    : node.tag === selector;
}
function element(parent: GroupNode, key: string, tag = 'div'): GroupNode {
  const node = new GroupNode(tag);
  node.dataset[key] = '';
  parent.append(node);
  return node;
}
const turn = () => new Promise<void>((resolve) => setImmediate(resolve));

export function groupUiFixture() {
  const account = crypto.randomUUID(),
    other = crypto.randomUUID();
  const group = {
    title: 'Synthetic group',
    head: 'a'.repeat(64),
    state: {
      groupId: crypto.randomUUID(),
      owner: account,
      members: [
        { accountId: account, role: 'owner' },
        { accountId: other, role: 'member' },
      ],
    },
  } as GroupSummary;
  const body = new GroupNode('body'),
    document = new GroupNode('#document'),
    window = new EventTarget(),
    host = new GroupNode(),
    aside = new GroupNode();
  body.append(host, aside);
  const nodes: Record<string, GroupNode> = {};
  for (const key of [
    'groupTitle',
    'groupAvatar',
    'groupCount',
    'groupNotice',
    'groupOlder',
    'groupHistory',
    'groupPending',
    'groupSettingsOpen',
  ])
    nodes[key] = element(host, key, key === 'groupAvatar' ? 'button' : 'div');
  nodes['groupAvatar']!.dataset['groupPhoto'] = '';
  const settings = element(host, 'groupSettings', 'dialog');
  nodes['groupSettings'] = settings;
  for (const key of [
    'groupSettingsClose',
    'groupSettingsTitle',
    'groupSettingsCount',
    'groupSettingsAvatar',
    'groupDescription',
    'groupDescriptionForm',
    'groupDescriptionInput',
    'groupDescriptionSave',
    'groupDescriptionReload',
    'groupDescriptionFeedback',
    'groupMembers',
    'groupManage',
    'groupVault',
    'groupUsage',
    'groupCleanupWarning',
    'groupCleanupItems',
    'groupCleanupMore',
    'groupClear',
    'groupOwnerNote',
    'groupLeave',
    'groupDelete',
    'groupSettingsNotice',
  ])
    nodes[key] = element(
      settings,
      key,
      key === 'groupSettingsAvatar' ? 'button' : 'div',
    );
  nodes['groupSettingsAvatar']!.dataset['groupPhoto'] = '';
  const form = element(host, 'groupCompose', 'form');
  nodes['groupCompose'] = form;
  for (const key of [
    'groupText',
    'groupEmoji',
    'voiceRecord',
    'voiceStop',
    'voiceCancel',
    'attachmentClear',
    'attachmentFile',
    'attachmentPreview',
  ])
    nodes[key] = element(
      form,
      key,
      key === 'groupText' ? 'textarea' : 'button',
    );
  for (const key of [
    'groupNew',
    'groupMode',
    'groupCancelCreate',
    'groupIncoming',
    'groupMoreIncoming',
  ])
    nodes[key] = element(aside, key);
  Object.assign(document, {
    body,
    visibilityState: 'visible',
    createElement: (tag: string) => new GroupNode(tag),
    createElementNS: (_namespace: string, tag: string) => new GroupNode(tag),
  });
  const calls: string[] = [],
    errors: unknown[] = [],
    confirmations: string[] = [],
    media: AbortSignal[] = [],
    photo = deferred<GroupPhoto | null>();
  const state = {
    aliases: new Map<string, string>([[other, 'Synthetic member']]),
    confirm: true,
    deferPhoto: false,
    photoLoads: 0,
    composeFailure: false,
    textSaveFailure: false,
    textAttempts: [] as string[],
    savedTexts: [] as { id: string; text: string; order: number }[],
    holdTextSend: false,
    textSend: deferred<void>(),
    historyReads: 0,
    drafts: [] as { id: string; text: string }[],
    vault: {
      textBytes: 2_000_000,
      mediaBytes: 3_000_000,
      notice: null,
      items: [{ message: 'message-12345678', bytes: 1_000_000 }],
      next: 8 as number | null,
    },
  };
  const controller = {
    selected: null as GroupSummary | null,
    entries: [group],
    views: [] as GroupView[],
    before: null,
    historyPending: false,
    warning: '',
    next: null,
    mode: 'configured',
    creationPending: false,
    incomingNext: null,
    incoming: [] as {
      id: string;
      groupId: string;
      actor: string;
      kind: 'invite' | 'transfer';
    }[],
    setSession() {
      this.selected = null;
      this.views = [];
    },
    async refresh() {},
    open(id: string, _older: boolean, localOnly: boolean) {
      state.historyReads++;
      this.selected = {
        ...group,
        state: { ...group.state, groupId: id },
        localOnly,
      };
      return Promise.resolve();
    },
    deselect() {
      this.selected = null;
    },
    resumePending() {
      return Promise.resolve(false);
    },
    pending() {
      return Promise.resolve(state.drafts);
    },
    discard(id: string) {
      calls.push(`discard:${id}`);
      state.drafts = state.drafts.filter((draft) => draft.id !== id);
      return Promise.resolve();
    },
    async photo() {
      state.photoLoads++;
      return state.deferPhoto ? photo.promise : null;
    },
    description() {
      return Promise.resolve({ description: 'Description', sequence: 1 });
    },
    vault(after = 0) {
      calls.push(`vault:${after}`);
      return Promise.resolve(state.vault);
    },
    clearVault() {
      calls.push('clear-vault');
      return Promise.resolve();
    },
    change(input: { kind: string; target: string | null }) {
      calls.push(
        input.kind === 'transfer' ? `transfer:${input.target}` : input.kind,
      );
      return Promise.resolve();
    },
    respond(consent: { kind: string }, accepted: boolean) {
      calls.push(`respond:${consent.kind}:${accepted}`);
      return Promise.resolve();
    },
    async refreshIncoming() {},
    async cancelCreation() {},
    async refreshReceipts() {},
    async updatePhoto() {},
    async updateDescription() {},
    compose(text: string) {
      calls.push(`compose:${text}`);
      return state.composeFailure
        ? Promise.reject(new Error('Synthetic compose failure'))
        : Promise.resolve();
    },
    composeText(
      _groupId: string,
      draft: { id: string; text: string; order: number },
    ) {
      state.textAttempts.push(draft.id);
      if (state.textSaveFailure)
        return Promise.reject(new Error('Synthetic text save failure'));
      state.savedTexts.push(draft);
      return Promise.resolve();
    },
    async sendGroupDrafts(
      _groupId: string,
      progress: { accepted: (id: string) => void },
    ) {
      if (state.holdTextSend) await state.textSend.promise;
      for (const draft of state.savedTexts) progress.accepted(draft.id);
    },
    memberWallets() {
      return Promise.resolve([]);
    },
    sendPending() {
      calls.push('send');
      return Promise.resolve();
    },
    media() {
      return Promise.resolve(new Uint8Array());
    },
    hide() {},
    revokeAuthority() {
      this.selected = null;
      this.views = [];
    },
    removed() {
      this.selected = null;
      this.views = [];
    },
  };
  const attachments = {
    selected: null as { voice?: object; bytes: Uint8Array } | null,
    mount() {},
    pausePreview() {
      calls.push('pause-preview');
    },
    clearSelection() {
      this.selected?.bytes.fill(0);
      this.selected = null;
    },
    clearMedia() {
      calls.push('clear-media');
    },
    render(input: { signal: AbortSignal }) {
      media.push(input.signal);
    },
    selectVoice(selection: typeof this.selected) {
      this.selected = selection;
    },
  };
  const voice = {
    active: false,
    state: { phase: 'idle' },
    start() {
      this.active = true;
      this.state.phase = 'recording';
      return Promise.resolve();
    },
    stop() {
      calls.push('stop-recording');
      this.active = false;
      return Promise.resolve();
    },
    cancel() {
      calls.push('cancel-recording');
      this.active = false;
    },
  };
  const fixture = {
    GroupBackups: class {},
    readGroupNotification() {},
    showGroupDirectoryPhoto() {},
    GroupController: function () {
      return controller;
    },
    AttachmentUi: function () {
      return attachments;
    },
    VoiceRecording: function () {
      return voice;
    },
    EmojiPicker: class {
      close() {}
      reset() {}
    },
    Contacts: class {
      setSession() {}
    },
    emojiIntoComposer: () => Promise.resolve(),
    emojiText: (node: GroupNode, text: string) => {
      node.textContent = text;
    },
    paintAvatar() {},
    displayName: (name: string) => name,
    shortAddress: (address: string) => address,
    showExternalVideos() {},
    showGifText() {},
    gifUrls: () => [],
    chatIcon: () => '',
    chatComposer: () => '',
    chatCollapse: () => '',
    bindChatComposer() {},
    updateChatComposer() {},
    showRecording() {},
    historyPosition: () => () => {},
    resetHistoryPosition() {},
    bindRecordGesture() {},
    ChatHistoryLoading: class {
      update() {
        return false;
      }
      reset() {}
    },
  };
  const context = {
    fixture,
    document,
    window,
    navigator: { onLine: true },
    crypto,
    Event,
    AbortController,
    AbortSignal,
    queueMicrotask,
    Blob,
    URL,
    TextDecoder,
    TextEncoder,
    atob,
    btoa,
    setTimeout,
    clearTimeout,
    performance,
    HTMLElement: GroupNode,
    HTMLButtonElement: GroupNode,
    Element: GroupNode,
  };
  const module = runInNewContext(
    `${bundle.outputFiles[0]!.text}\ngroups;`,
    context,
  ) as { startGroups: typeof startGroups };
  const ui = module.startGroups(
    {} as Parameters<typeof startGroups>[0],
    {} as Parameters<typeof startGroups>[1],
    {
      playback: {} as Parameters<typeof startGroups>[2]['playback'],
      daily: {
        setGroups() {},
        loadSettings: () => Promise.resolve(),
        groupStates: () => Promise.resolve(new Map()),
        conversation: () => ({}),
      } as unknown as Parameters<typeof startGroups>[2]['daily'],
      run: async (work) => {
        try {
          await work();
        } catch (error: unknown) {
          errors.push(error);
        }
      },
      changed() {},
      select() {
        calls.push('select');
      },
      isBusy: () => false,
      alert() {},
      peers: () => [],
      alias: (account) => state.aliases.get(account) ?? '',
      addContact() {},
      profile: () => Promise.resolve(null),
    },
  );
  Object.assign(window, {
    confirm: (text: string) => {
      confirmations.push(text);
      return state.confirm;
    },
  });
  const session = {
    accountId: account,
    deviceId: crypto.randomUUID(),
    csrf: 'synthetic',
  } as Parameters<typeof ui.setSession>[0];
  ui.setSession(session);
  ui.mount(host as unknown as HTMLElement, aside as unknown as HTMLElement);
  return {
    ui,
    controller,
    account,
    other,
    group,
    nodes,
    calls,
    errors,
    state,
    voice,
    attachments,
    confirmations,
    media,
    photo,
    session,
    window,
    document,
    async click(key: string) {
      nodes[key]!.click();
      await turn();
    },
    async refresh() {
      await ui.refresh();
      await turn();
    },
  };
}
