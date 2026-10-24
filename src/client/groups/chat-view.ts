import { t, translatedError } from '../../shared/i18n/index.ts';
import type { GroupController } from './controller.ts';
import type { GroupView } from './reader.ts';
import { GroupMessageActions } from './message-actions.ts';
import type { VoicePlayback } from '../voice-playback/index.ts';
import { VoiceRecording } from '../voice-recording/index.ts';
import { AttachmentUi } from '../attachment-ui/index.ts';
import { EmojiPicker, emojiIntoComposer, emojiText } from '../emoji/index.ts';
import type { ExternalMediaConsent } from '../external-media/index.ts';
import { ExternalTextHistory } from '../external-media/index.ts';
import { showExternalVideos } from '../external-video/index.ts';
import { showGifText, gifUrls } from '../gif-search/index.ts';
import { checksIcon, messageChecks } from '../message-status/index.ts';
import { groupTextQueue } from './text-queue.ts';
import { GroupOutgoing } from './outgoing.ts';
import type { PendingGroupText } from './outgoing.ts';
import { GroupDeliveryTrace } from './delivery-trace.ts';
import type { GroupSendProgress } from './outbox.ts';
import type { GroupMemberPresentation } from './member-presentation.ts';
import { memberContactTrigger } from './member-contact.ts';
import { measureWork } from '../synchronization-diagnostics/index.ts';
import { chatFileLimit } from '../../shared/attachments/index.ts';
import {
  updateChatComposer,
  historyPosition,
  resetHistoryPosition,
  bindChatComposer,
  bindRecordGesture,
  showRecording,
} from '../chat-ui/index.ts';
interface ChatOptions {
  controller: Pick<
    GroupController,
    | 'selected'
    | 'historyPending'
    | 'views'
    | 'before'
    | 'media'
    | 'edit'
    | 'removeMessage'
    | 'compose'
    | 'sendPending'
    | 'composeText'
    | 'sendGroupDrafts'
  >;
  account: () => string | undefined;
  playback: VoicePlayback;
  externalMedia?: ExternalMediaConsent | undefined;
  isBusy: () => boolean;
  members: Pick<
    GroupMemberPresentation,
    'name' | 'label' | 'sender' | 'contactCandidate' | 'offerContact'
  >;
  visibleGroup: () => string | null;
  reconcile: (group: string) => Promise<void>;
  operationRun: (work: () => Promise<void>) => Promise<void>;
  run: (work: () => Promise<void>) => Promise<void>;
  reopen: (older?: boolean) => Promise<void>;
  select: () => void;
  report: (notice: string) => void;
  status: () => void;
}
/** Owns the mounted conversation's bubbles, composer and media resources.
 * Persistence, verified reads and group authority stay in the controller. */
export class GroupChatView {
  private readonly options: ChatOptions;
  private readonly outgoing = new GroupOutgoing();
  private readonly delivery = new GroupDeliveryTrace();
  private readonly texts: ReturnType<typeof groupTextQueue>;
  private host: HTMLElement | null = null;
  private readonly emoji = new EmojiPicker();
  private readonly attachments: AttachmentUi;
  private readonly voice: VoiceRecording;
  private readonly messageActions: GroupMessageActions;
  private readonly externalRows = new ExternalTextHistory();
  private externalAbort = new AbortController();
  constructor(options: ChatOptions) {
    this.options = options;
    this.attachments = new AttachmentUi(
      options.playback,
      () => this.voiceStatus(),
      chatFileLimit,
    );
    this.voice = new VoiceRecording({
      changed: () => this.voiceStatus(),
      completed: (selection) => {
        const account = options.account(),
          selected = options.controller.selected;
        if (!account || !selected) {
          selection.bytes.fill(0);
          return;
        }
        this.attachments.selectVoice(selection, account);
        this.voiceStatus();
      },
    });
    this.messageActions = new GroupMessageActions({
      run: options.run,
      edit: async (view, text) => {
        await options.controller.edit(view, text);
        await options.reopen();
      },
      remove: async (view) => {
        const pending = options.controller.removeMessage(view);
        this.renderHistory();
        try {
          await pending;
          await options.reopen();
        } finally {
          this.renderHistory();
        }
      },
    });
    const sendProgress: GroupSendProgress = {
      sending: (id) => this.delivery.step('sending', id),
      accepted: (id) => {
        this.delivery.step('accepted', id);
        const open = this.options.visibleGroup();
        this.outgoing.accepted(id, performance.now(), open);
        if (open && this.outgoing.crowded(open))
          this.options
            .reconcile(open)
            .catch((error: unknown) => this.reportGroupError(error));
      },
    };
    this.texts = groupTextQueue({
      save: (groupId, draft) =>
        this.options.controller.composeText(groupId, draft),
      send: async (groupId) => {
        let sent = false;
        const queued = performance.now();
        await this.options.operationRun(() =>
          measureWork(
            this.options.controller,
            'group/send',
            async () => {
              await this.options.controller.sendGroupDrafts(
                groupId,
                sendProgress,
              );
              sent = true;
            },
            queued,
          ),
        );
        return sent;
      },
      available: () => !!this.options.controller.selected && navigator.onLine,
      changed: () => {
        this.composerStatus();
        this.options.status();
      },
      failed: (error) => this.reportGroupError(error),
      draftChanged: (draft, phase) => {
        this.outgoing.update(draft, phase);
        if (phase !== 'save-failed')
          this.delivery.step(
            phase === 'admitted' ? 'admitted' : 'staged',
            draft.id,
          );
        this.renderHistory();
      },
    });
  }

  status(): void {
    const compose = this.node<HTMLFormElement>('[data-group-compose]');
    if (compose) compose.hidden = !!this.options.controller.selected?.localOnly;
    this.voiceStatus();
  }
  get recording(): boolean {
    return this.voice.active || !!this.attachments.selected?.voice;
  }
  canActivate(): boolean {
    return !this.voice.active && !this.attachments.selected;
  }
  closeActions(): void {
    this.messageActions.close();
  }
  pauseActions(): void {
    this.messageActions.pause();
  }
  open(id: string): void {
    this.messageActions.close();
    if (this.recording)
      throw new Error(
        'Send or remove the voice preview before changing conversations.',
      );
    if (this.options.controller.selected?.state.groupId !== id)
      resetHistoryPosition(this.node('[data-group-history]'));
    this.options.select();
    this.attachments.clearSelection();
    this.emoji.close();
    if (this.host) this.host.hidden = false;
  }
  deselect(): void {
    this.attachments.clearSelection();
    this.attachments.clearMedia();
    this.emoji.close();
    if (this.host) this.host.hidden = true;
  }
  invalidateHistory(): void {
    this.externalRows.clear();
    this.externalAbort.abort();
    this.externalAbort = new AbortController();
  }
  clearSession(): void {
    this.voice.cancel();
    this.attachments.clearSelection();
    this.attachments.clearMedia();
    this.emoji.reset();
  }
  leave(): void {
    this.invalidateHistory();
    if (this.voice.active)
      void this.voice.stop(
        t(
          'Navigation interrupted recording. Check the excerpt when you return.',
        ),
      );
    this.attachments.clearMedia();
    this.attachments.pausePreview();
    this.emoji.close();
  }
  suspend(revoked: boolean): void {
    this.attachments.clearMedia();
    this.renderHistory();
    if (revoked) {
      this.voice.cancel();
      this.attachments.clearSelection();
    }
  }
  bindBrowserLifetime(): void {
    window.addEventListener('beforeunload', (event) => {
      if (!this.recording) return;
      event.preventDefault();
      event.returnValue = '';
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && this.voice.active)
        void this.voice.stop(
          t(
            'The browser interrupted recording. Check the preserved excerpt when you return.',
          ),
        );
    });
  }
  mount(container: HTMLElement): void {
    this.host = container;
    this.attachments.mount(container, this.options.run);
    const form = this.node('[data-group-compose]');
    if (form) bindChatComposer(form, () => this.composerStatus());
    this.bindChat();
  }
  private node<T extends HTMLElement>(selector: string): T | null {
    return this.host?.querySelector<T>(selector) ?? null;
  }
  private composerStatus(): void {
    updateChatComposer(this.node('[data-group-compose]'), {
      blocked: this.options.isBusy() || !this.options.controller.selected,
      textSendBlocked: this.canQueueText() ? this.texts.full : undefined,
      recording: this.voice.active,
      attachment: this.attachments.selected !== null,
    });
  }
  private voiceStatus(): void {
    this.composerStatus();
    showRecording(this.node('[data-group-compose]'), this.voice.state);
    this.voiceControls();
  }
  private voiceControls(): void {
    const stop = this.node<HTMLButtonElement>('[data-voice-stop]');
    if (stop) stop.hidden = !this.voice.active;
    const cancel = this.node('[data-voice-cancel]');
    if (cancel) cancel.hidden = !this.voice.active;
    const start = this.node<HTMLButtonElement>('[data-voice-record]');
    if (start)
      start.disabled =
        this.options.isBusy() ||
        this.voice.active ||
        this.attachments.selected !== null;
    const file = this.node<HTMLInputElement>('[data-attachment-file]');
    if (file)
      file.disabled =
        this.options.isBusy() ||
        this.voice.active ||
        !!this.attachments.selected?.voice;
  }
  renderHistory(): void {
    const history = this.node('[data-group-history]');
    if (!history) return;
    history.hidden = this.options.controller.historyPending;
    if (this.options.controller.historyPending) {
      this.messageActions.pause();
      return;
    }
    this.messageActions.resume(this.options.controller.views);
    const restoreScroll = historyPosition(history);
    this.externalRows.render(
      history,
      [
        ...this.options.controller.views.map((view, index, views) => ({
          id: view.id,
          key: JSON.stringify([
            view.text,
            view.hash,
            view.sender,
            this.options.members.name(view.sender),
            this.options.members.label(view.sender).wallet ?? '',
            this.startsRun(views, index),
            view.localOnly,
            view.kind,
            view.unavailableMedia,
            view.edited,
          ]),
          render: (signal: AbortSignal) =>
            this.renderView(view, signal, this.startsRun(views, index)),
        })),
        ...this.pendingRows(),
      ],
      this.externalAbort.signal,
    );
    this.delivery.rendered(
      this.options.controller.selected?.state.groupId ?? null,
      this.options.controller.views,
    );
    for (const view of this.options.controller.views) {
      const row = history.querySelector<HTMLElement>(
        `[data-group-message="${view.id}"]`,
      );
      if (row) this.renderDelivery(row, view);
    }
    restoreScroll();
    const older = this.node('[data-group-older]');
    if (older) older.hidden = this.options.controller.before === null;
  }
  private renderView(
    view: GroupView,
    mediaSignal: AbortSignal,
    first: boolean,
  ): HTMLElement {
    const article = document.createElement('article');
    article.className = view.own
      ? 'chat-message own'
      : 'chat-message group-incoming';
    article.dataset['groupMessage'] = view.id;
    this.appendAuthor(article, view, first);
    if (view.kind === 'attachment') {
      this.attachments.render({
        article,
        view: { id: view.id, text: view.text, peer: view.sender },
        signal: mediaSignal,
        load: (_media, thumbnail) =>
          this.options.controller.media(view, thumbnail),
        run: this.options.run,
      });
      if (view.unavailableMedia.length) {
        const unavailable = document.createElement('p');
        unavailable.textContent = t(
          'Media unavailable in the remote vault. A downloaded copy may remain on this device.',
        );
        article.append(unavailable);
      }
    } else {
      const text = document.createElement('p');
      emojiText(text, view.text);
      this.renderExternal(article, text, view.text, mediaSignal);
      article.append(text);
    }
    this.renderDelivery(article, view);
    if (view.localOnly) {
      const local = document.createElement('small');
      local.textContent = t(
        'Local copy · content unavailable in the remote vault',
      );
      article.append(local);
    }
    article.append(this.messageActions.render(view, mediaSignal));
    return article;
  }
  private renderDelivery(article: HTMLElement, view: GroupView): void {
    article.querySelector('.message-meta')?.remove();
    const checks = messageChecks({
      own: view.own,
      ...(view.delivery ? { delivery: view.delivery } : {}),
      read: view.read ?? false,
    });
    if (checks || view.edited) {
      const state = document.createElement('small');
      state.className = 'message-meta';
      if (view.edited) state.append(t('Edited · '));
      if (checks)
        state.append(
          checksIcon({
            ...checks,
            label: view.read
              ? t('Seen by recipients who share read receipts')
              : checks.label,
          }),
        );
      article.append(state);
    }
  }
  private renderExternal(
    article: HTMLElement,
    text: HTMLElement,
    value: string,
    mediaSignal: AbortSignal,
  ): void {
    if (!this.options.externalMedia) return;
    const settings = {
      privacy: this.options.externalMedia,
      signal: mediaSignal,
    };
    const gif = gifUrls(value).length;
    if (gif) {
      text.replaceChildren();
      showGifText(text, value, { ...settings, renderText: emojiText });
    }
    showExternalVideos(article, value, settings);
  }

  private bind(selector: string, handler: () => void): void {
    this.node(selector)?.addEventListener('click', handler);
  }

  private bindChat(): void {
    this.node<HTMLFormElement>('[data-group-compose]')?.addEventListener(
      'submit',
      (event) => {
        event.preventDefault();
        if (this.queueText()) return;
        void this.options.run(async () => {
          const input = this.node<HTMLTextAreaElement>('[data-group-text]'),
            group = this.options.controller.selected?.state.groupId;
          // Each chosen file is its own message, sent before the next is
          // staged so the order holds; only the first carries the text.
          do {
            await this.options.controller.compose(
              input?.value ?? '',
              this.attachments.selected,
            );
            this.attachments.sent();
            this.voice.cancel();
            if (input) {
              input.value = '';
              input.dispatchEvent(new Event('input'));
            }
            await this.options.controller.sendPending();
          } while (
            this.attachments.selected &&
            this.options.controller.selected?.state.groupId === group
          );
          await this.options.reopen();
          this.options.report(t('Message sent.'));
        });
      },
    );
    this.bind(
      '[data-group-older]',
      () => void this.options.run(() => this.options.reopen(true)),
    );
    this.bind('[data-group-emoji]', () => {
      const anchor = this.node('[data-group-emoji]'),
        input = this.node<HTMLTextAreaElement>('[data-group-text]');
      if (!anchor || !input) return;
      void emojiIntoComposer(this.emoji, anchor, input).catch(() => {
        this.options.report(t('Could not open emoji.'));
        this.options.status();
      });
    });
    bindRecordGesture(this.node('[data-voice-record]'), {
      start: () => {
        if (
          !this.options.isBusy() &&
          !this.voice.active &&
          !this.attachments.selected
        )
          void this.voice.start();
      },
      // Releasing before the microphone opens keeps recording hands-free.
      release: () => {
        if (this.voice.state.phase === 'recording') void this.voice.stop();
      },
    });
    this.bind('[data-voice-stop]', () => void this.voice.stop());
    this.bind('[data-voice-cancel]', () => this.voice.cancel());
    this.bind('[data-attachment-clear]', () => {
      if (!this.voice.active) this.voice.cancel();
    });
  }
  private canQueueText(): boolean {
    return (
      !!this.options.controller.selected &&
      !this.options.controller.selected.localOnly &&
      !this.voice.active &&
      this.attachments.selected === null
    );
  }
  private pendingRows() {
    const group = this.options.controller.selected;
    if (!group) return [];
    return this.outgoing
      .rows(
        group.state.groupId,
        new Set(this.options.controller.views.map((v) => v.id)),
      )
      .map((text) => ({
        id: `pending:${text.id}`,
        key: JSON.stringify(['pending', text.text, text.failed]),
        render: () => this.renderPendingText(text),
      }));
  }
  private renderPendingText(text: PendingGroupText): HTMLElement {
    const article = document.createElement('article');
    article.className = 'chat-message own';
    article.dataset['groupPending'] = text.id;
    const sender = document.createElement('strong');
    sender.textContent = t('You');
    const body = document.createElement('p');
    emojiText(body, text.text);
    const state = document.createElement('small');
    state.className = 'message-meta';
    if (text.failed) {
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'message-send-failed';
      retry.textContent = '✕';
      retry.title = t('chat.save-failed');
      retry.setAttribute(
        'aria-label',
        t('{0}. {1}', [t('chat.save-failed'), t('chat.retry-save')]),
      );
      retry.addEventListener('click', () => this.texts.retry());
      state.append(retry);
    } else
      state.append(
        checksIcon(
          messageChecks({ own: true, delivery: 'accepted', read: false })!,
        ),
      );
    article.append(sender, body, state);
    return article;
  }
  private startsRun(views: readonly GroupView[], index: number): boolean {
    return index === 0 || views[index - 1]?.sender !== views[index]?.sender;
  }
  private appendAuthor(
    article: HTMLElement,
    view: GroupView,
    first: boolean,
  ): void {
    if (view.own) {
      const sender = document.createElement('strong');
      sender.textContent = this.options.members.name(view.sender);
      article.append(sender);
      return;
    }
    if (!first) return;
    article.classList.add('group-run-start');
    const [avatar, author] = this.options.members.sender(view.sender);
    if (!avatar || !author) return;
    if (this.options.members.contactCandidate(view.sender))
      memberContactTrigger(
        author,
        this.options.members.name(view.sender),
        () => {
          void this.options.run(() =>
            this.options.members.offerContact(view.sender),
          );
        },
      );
    article.append(avatar, author);
  }
  settleOutgoing(id: string, started: number): void {
    const selected = this.options.controller.selected;
    if (
      selected?.state.groupId !== id ||
      selected.localOnly ||
      this.options.controller.historyPending
    )
      return;
    const { settled, retired } = this.outgoing.verified(
      id,
      new Set(this.options.controller.views.map((view) => view.id)),
      started,
    );
    for (const message of settled) this.delivery.step('settled', message);
    for (const message of retired) this.delivery.step('retired', message);
    if (retired.length) this.renderHistory();
  }
  private reportGroupError(error: unknown): void {
    this.options.report(
      error instanceof Error
        ? translatedError(error.message)
        : t('Could not complete the group operation.'),
    );
    this.options.status();
  }
  private queueText(): boolean {
    const input = this.node<HTMLTextAreaElement>('[data-group-text]'),
      group = this.options.controller.selected;
    if (!input || !group || !this.canQueueText() || !input.value.trim())
      return false;
    try {
      this.texts.enqueue({
        id: crypto.randomUUID(),
        peer: group.state.groupId,
        text: input.value,
      });
    } catch (error: unknown) {
      this.options.report(
        error instanceof Error
          ? translatedError(error.message)
          : t('Could not complete the group operation.'),
      );
      this.options.status();
      return true;
    }
    input.value = '';
    input.dispatchEvent(new Event('input'));
    // Keep typing: the chat and its keyboard stay as they were.
    input.focus();
    return true;
  }
  resetTexts(): void {
    this.texts.reset();
    this.outgoing.clear();
  }
  hint(): void {
    this.delivery.hint();
  }
}
