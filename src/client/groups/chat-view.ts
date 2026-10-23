import { t } from '../../shared/i18n/index.ts';
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
    | 'pending'
    | 'discard'
  >;
  account: () => string | undefined;
  playback: VoicePlayback;
  externalMedia?: ExternalMediaConsent | undefined;
  isBusy: () => boolean;
  name: (account: string) => string;
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
      this.options.controller.views.map((view) => ({
        id: view.id,
        key: JSON.stringify([
          view.text,
          view.hash,
          view.sender,
          this.options.name(view.sender),
          view.localOnly,
          view.kind,
          view.unavailableMedia,
          view.edited,
        ]),
        render: (signal) => this.renderView(view, signal),
      })),
      this.externalAbort.signal,
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
  private renderView(view: GroupView, mediaSignal: AbortSignal): HTMLElement {
    const article = document.createElement('article');
    article.className = view.own ? 'chat-message own' : 'chat-message';
    article.dataset['groupMessage'] = view.id;
    const sender = document.createElement('strong');
    sender.textContent = this.options.name(view.sender);
    article.append(sender);
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
  async pending(): Promise<void> {
    const list = this.node('[data-group-pending]');
    if (!list) return;
    list.replaceChildren();
    for (const draft of await this.options.controller.pending()) {
      const row = document.createElement('li');
      row.textContent = t('Draft {0} pending ', [draft.id.slice(0, 8)]);
      row.append(
        this.button(t('Resume'), async () => {
          await this.options.controller.sendPending();
          await this.options.reopen();
        }),
      );
      row.append(
        this.button(t('Discard local draft'), async () => {
          await this.options.controller.discard(draft.id);
          await this.pending();
          this.options.report(
            t(
              'Local draft discarded. This does not delete a message already accepted.',
            ),
          );
        }),
      );
      list.append(row);
    }
  }
  private bind(selector: string, handler: () => void): void {
    this.node(selector)?.addEventListener('click', handler);
  }
  private button(label: string, work: () => Promise<void>): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.addEventListener('click', () => void this.options.run(work));
    return b;
  }
  private bindChat(): void {
    this.node<HTMLFormElement>('[data-group-compose]')?.addEventListener(
      'submit',
      (event) => {
        event.preventDefault();
        void this.options.run(async () => {
          const input = this.node<HTMLTextAreaElement>('[data-group-text]');
          await this.options.controller.compose(
            input?.value ?? '',
            this.attachments.selected,
          );
          this.attachments.clearSelection();
          this.voice.cancel();
          if (input) {
            input.value = '';
            input.dispatchEvent(new Event('input'));
          }
          await this.options.controller.sendPending();
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
}
