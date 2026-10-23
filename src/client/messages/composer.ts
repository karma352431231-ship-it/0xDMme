import { chatFileLimit } from '../../shared/attachments/index.ts';
import { decodeDailyText, encodeDailyText } from '../../shared/daily/index.ts';
import { t, translatedError } from '../../shared/i18n/index.ts';
import { AttachmentUi } from '../attachment-ui/index.ts';
import type { AttachmentSelection } from '../attachments/index.ts';
import {
  bindChatComposer,
  bindRecordGesture,
  showRecording,
  updateChatComposer,
} from '../chat-ui/index.ts';
import { dailyViews } from '../daily-text/index.ts';
import { EmojiPicker, emojiIntoComposer } from '../emoji/index.ts';
import type { ExternalMediaConsent } from '../external-media/index.ts';
import { GifSearch, gifMessageUrl, mountGifPane } from '../gif-search/index.ts';
import type { VoicePlayback } from '../voice-playback/index.ts';
import { VoiceRecording } from '../voice-recording/index.ts';
import type { MessageView, Messages } from './controller.ts';

interface ComposerAvailability {
  peer: string | null;
  localOnly: boolean;
  authenticated: boolean;
  busy: boolean;
  historyReady: boolean;
  callActive: boolean;
  textSendBlocked: boolean | undefined;
}
interface ComposerOptions {
  playback: VoicePlayback;
  controller: Pick<Messages, 'compose' | 'composeAction' | 'composeAttachment'>;
  availability: () => ComposerAvailability;
  signal: () => AbortSignal;
  externalMedia?: ExternalMediaConsent;
  run: (work: () => Promise<void>) => Promise<void>;
  textChanged: () => void;
  report: (notice: string) => void;
  sendGif: (url: string) => Promise<void>;
  call?: (peer: string) => Promise<void>;
}

/** Owns composition state and preview/recording resources; delivery stays in the message service. */
export class MessageComposer {
  private readonly options: ComposerOptions;
  private readonly attachments: AttachmentUi;
  private readonly voice: VoiceRecording;
  private readonly emoji = new EmojiPicker();
  private readonly gifs: GifSearch;
  private host: HTMLElement | null = null;
  private composing: { mode: 'reply' | 'edit'; view: MessageView } | null =
    null;
  private focusRequested = false;
  private recordingPeer: string | null = null;
  private generation = 0;
  private bindings = new AbortController();
  readonly media: Pick<AttachmentUi, 'clearMedia' | 'render'>;
  readonly picker: Pick<EmojiPicker, 'choose'>;

  constructor(options: ComposerOptions) {
    this.options = options;
    this.attachments = new AttachmentUi(
      options.playback,
      () => this.update(),
      chatFileLimit,
    );
    this.voice = new VoiceRecording({
      changed: () => this.update(),
      completed: (selection) => this.recorded(selection),
    });
    this.gifs = new GifSearch(
      () =>
        options.externalMedia?.authorize('gifs', options.signal()) ??
        Promise.resolve(false),
      () =>
        AbortSignal.any([
          options.signal(),
          ...(options.externalMedia ? [options.externalMedia.signal] : []),
        ]),
    );
    this.media = {
      clearMedia: () => this.attachments.clearMedia(),
      render: (input) => this.attachments.render(input),
    };
    this.picker = { choose: (...args) => this.emoji.choose(...args) };
  }
  get recording(): boolean {
    return this.voice.active;
  }
  get voicePreview(): boolean {
    return !!this.attachments.selected?.voice;
  }
  get hasAttachment(): boolean {
    return this.attachments.selected !== null;
  }
  get acceptsQueuedText(): boolean {
    return (
      !this.voice.active &&
      !this.attachments.selected &&
      this.composing?.mode !== 'edit'
    );
  }
  get text(): string {
    return this.node<HTMLTextAreaElement>('[data-message-text]')?.value ?? '';
  }

  private node<T extends HTMLElement>(selector: string): T | null {
    return this.host?.querySelector<T>(selector) ?? null;
  }
  private recorded(selection: AttachmentSelection): void {
    const state = this.options.availability();
    if (
      !state.authenticated ||
      !this.recordingPeer ||
      state.peer !== this.recordingPeer
    ) {
      selection.bytes.fill(0);
      return;
    }
    this.attachments.selectVoice(selection, this.recordingPeer);
    this.update();
  }
  update(): void {
    const state = this.options.availability();
    showRecording(this.node('[data-message-form]'), this.voice.state);
    updateChatComposer(this.node('[data-message-form]'), {
      blocked: state.busy || !state.historyReady || !state.peer,
      textSendBlocked: state.textSendBlocked,
      recording: this.voice.active,
      attachment: this.hasAttachment,
    });
    this.focus();
    this.voiceButtons(state);
    const file = this.node<HTMLInputElement>('[data-attachment-file]');
    if (file)
      file.disabled =
        state.busy ||
        !state.historyReady ||
        this.voice.active ||
        this.voicePreview;
  }
  private voiceButtons(state: ComposerAvailability): void {
    const start = this.node<HTMLButtonElement>('[data-voice-record]');
    if (start)
      start.disabled =
        state.busy ||
        !state.historyReady ||
        this.voice.active ||
        this.hasAttachment ||
        !state.peer ||
        state.callActive;
    const stop = this.node<HTMLButtonElement>('[data-voice-stop]');
    if (stop) {
      stop.hidden = !this.voice.active;
      stop.disabled = this.voice.state.phase === 'stopping';
    }
    const cancel = this.node<HTMLButtonElement>('[data-voice-cancel]');
    if (cancel) cancel.hidden = !this.voice.active;
  }
  private focus(): void {
    const input = this.node<HTMLTextAreaElement>('[data-message-text]');
    if (!this.focusRequested || !input || input.disabled) return;
    this.focusRequested = false;
    input.focus();
  }
  choose(
    mode: 'reply' | 'edit',
    view: MessageView,
    visible: readonly MessageView[],
  ): void {
    this.generation++;
    this.composing = { mode, view };
    const original =
      dailyViews(visible).find((row) => row.id === view.id)?.content.text ??
      decodeDailyText(view.text).text;
    const label = this.node('[data-compose-context]');
    if (label)
      label.textContent = t('{0}: {1}', [
        mode === 'edit' ? t('Editing') : t('Replying'),
        original.slice(0, 120),
      ]);
    const bar = this.node('[data-compose-bar]');
    if (bar) bar.hidden = false;
    const input = this.node<HTMLTextAreaElement>('[data-message-text]');
    if (mode === 'edit' && input) input.value = original;
    input?.dispatchEvent(new Event('input'));
    this.focusRequested = true;
    this.focus();
  }
  clearContext(): void {
    this.generation++;
    this.composing = null;
    this.focusRequested = false;
    const label = this.node('[data-compose-context]');
    if (label) label.textContent = '';
    const bar = this.node('[data-compose-bar]');
    if (bar) bar.hidden = true;
    this.update();
  }
  queueText(accept: (text: string, reply: string | null) => void): boolean {
    const input = this.node<HTMLTextAreaElement>('[data-message-text]');
    if (!input?.value.trim()) return false;
    accept(input.value, this.composing?.view.id ?? null);
    input.value = '';
    this.clearContext();
    input.dispatchEvent(new Event('input'));
    // Keep typing: the chat and its keyboard stay as they were.
    input.focus();
    return true;
  }
  async save(peer: string | null): Promise<boolean> {
    if (this.voice.active)
      throw new Error('Stop recording and check the preview before sending.');
    const input = this.node<HTMLTextAreaElement>('[data-message-text]');
    if (!peer || !input || (!input.value.trim() && !this.hasAttachment))
      throw new Error(
        'Select a contact and write a message or choose an attachment.',
      );
    const generation = this.generation;
    await this.saveComposition(peer, input.value);
    if (
      generation !== this.generation ||
      this.options.availability().peer !== peer
    )
      return false;
    input.value = '';
    input.dispatchEvent(new Event('input'));
    this.clearContext();
    this.attachments.clearSelection();
    this.cancelRecording();
    return true;
  }
  private async saveComposition(peer: string, text: string): Promise<void> {
    const { controller } = this.options;
    if (this.composing?.mode === 'edit') {
      if (this.attachments.selected)
        throw new Error(
          'Editing changes text only; remove the selected attachment.',
        );
      await controller.composeAction(
        this.composing.view,
        'edit',
        encodeDailyText({
          text,
          reply: decodeDailyText(this.composing.view.text).reply,
          forwarded: decodeDailyText(this.composing.view.text).forwarded,
        }),
      );
    } else if (this.attachments.selected)
      await controller.composeAttachment(
        peer,
        this.attachments.selected,
        encodeDailyText({
          text,
          reply: this.composing?.view.id ?? null,
          forwarded: false,
        }),
      );
    else
      await controller.compose(
        peer,
        encodeDailyText({
          text,
          reply: this.composing?.view.id ?? null,
          forwarded: false,
        }),
      );
  }
  async saveGif(
    peer: string | null,
    localOnly: boolean,
    url: string,
  ): Promise<void> {
    if (!peer || localOnly)
      throw new Error('Choose an authorized contact to send the GIF.');
    if (!gifMessageUrl(url)) throw new Error('Invalid GIF.');
    await this.options.controller.compose(
      peer,
      encodeDailyText({ text: url, reply: null, forwarded: false }),
    );
  }
  clearAttachment(): void {
    this.attachments.clearSelection();
  }
  cancelRecording(): void {
    this.voice.cancel();
    this.recordingPeer = null;
  }
  stopRecording(notice?: string): Promise<void> {
    return this.voice.stop(notice);
  }
  closePicker(): void {
    this.emoji.close();
  }
  resetPicker(): void {
    this.emoji.reset();
  }
  pause(): void {
    if (this.voice.active)
      void this.voice.stop(
        t(
          'Navigation interrupted recording; the excerpt is preserved for review when returning to the conversation.',
        ),
      );
    this.attachments.clearMedia();
    this.attachments.pausePreview();
  }
  async checkRecordingAuthority(
    allowed: (peer: string) => Promise<boolean>,
  ): Promise<void> {
    if (!this.voice.active || !this.recordingPeer) return;
    const peer = this.recordingPeer,
      generation = this.generation;
    try {
      if (
        !(await allowed(peer)) &&
        generation === this.generation &&
        peer === this.recordingPeer
      )
        await this.voice.stop(
          t(
            'This conversation was blocked. The excerpt is preserved only as a local preview.',
          ),
        );
    } catch {
      // Revocation/session termination has its own immediate lifecycle event.
    }
  }
  dispose(): void {
    this.bindings.abort();
    this.clearContext();
    this.cancelRecording();
    this.attachments.clearSelection();
    this.attachments.clearMedia();
    this.emoji.reset();
    this.setPeer(null);
    this.host = null;
  }
  setPeer(peer: string | null): void {
    if (!this.host) return;
    if (peer) this.host.dataset['voicePeer'] = peer;
    else delete this.host.dataset['voicePeer'];
  }
  mount(host: HTMLElement): void {
    if (host !== this.host) this.generation++;
    this.bindings.abort();
    this.bindings = new AbortController();
    this.host = host;
    this.setPeer(this.options.availability().peer);
    this.attachments.mount(host, this.options.run);
    const form = this.node('[data-message-form]');
    if (form)
      bindChatComposer(form, () => {
        this.options.textChanged();
        this.update();
      });
    this.bind('[data-message-emoji]', () => this.openEmoji());
    this.bind('[data-compose-cancel]', () => {
      if (this.composing?.mode === 'edit') {
        const input = this.node<HTMLTextAreaElement>('[data-message-text]');
        if (input) {
          input.value = '';
          input.dispatchEvent(new Event('input'));
        }
      }
      this.clearContext();
    });
    this.bind('[data-attachment-clear]', () => {
      if (!this.voice.active) this.voice.cancel();
    });
    this.bindVoice();
  }
  private bind(selector: string, handler: () => void): void {
    this.node(selector)?.addEventListener('click', handler, {
      signal: this.bindings.signal,
    });
  }
  private openEmoji(): void {
    const input = this.node<HTMLTextAreaElement>('[data-message-text]'),
      anchor = this.node('[data-message-emoji]');
    if (!input || !anchor) return;
    void emojiIntoComposer(this.emoji, anchor, input, {
      pane: (host, close) => {
        mountGifPane(host, this.gifs, (url) => {
          close();
          void this.options.run(() => this.options.sendGif(url));
        });
      },
    }).catch(() => this.options.report(t('Could not open the emoji panel.')));
  }
  private bindVoice(): void {
    this.bind('[data-call-start]', () => {
      const state = this.options.availability();
      if (state.peer && !state.localOnly && this.options.call)
        void this.options.call(state.peer).catch((error: unknown) => {
          this.options.report(
            error instanceof Error
              ? translatedError(error.message)
              : t('Could not complete the operation.'),
          );
        });
    });
    bindRecordGesture(this.node('[data-voice-record]'), {
      signal: this.bindings.signal,
      start: () => this.startRecording(),
      release: () => {
        if (this.voice.state.phase === 'recording') void this.voice.stop();
      },
    });
    this.bind('[data-voice-stop]', () => {
      void this.voice.stop();
    });
    this.bind('[data-voice-cancel]', () => this.cancelRecording());
  }
  private startRecording(): void {
    const state = this.options.availability();
    if (
      state.busy ||
      this.voice.active ||
      this.hasAttachment ||
      !state.peer ||
      !state.authenticated ||
      state.callActive
    )
      return;
    this.recordingPeer = state.peer;
    void this.voice.start();
  }
}
