import type { QueueGate, QueueWakeup } from '../text-send/index.ts';
import {
  beginPrivateSend,
  traceSend,
  tracePrivateTextQueue,
  traceTextQueue,
  privateSendBatch,
} from '../chat-sync-diagnostics/index.ts';
import type {
  PrivateSendContext,
  SendWaitReason,
} from '../chat-sync-diagnostics/index.ts';
import { networkAvailable } from '../connectivity/index.ts';
import { t, translatedError } from '../../shared/i18n/index.ts';
import { encodeGroupText } from '../../shared/group-messages/index.ts';
import { chatFileLimit } from '../../shared/attachments/index.ts';
import {
  updateChatComposer,
  bindChatComposer,
  bindRecordGesture,
  showRecording,
  viewOnceEnabled,
} from '../chat-ui/index.ts';
import { AttachmentUi } from '../attachment-ui/index.ts';
import {
  AttachmentSubmissions,
  submittedMediaRows,
  updateSubmittedMediaStates,
} from '../attachment-submissions/index.ts';
import { VoiceRecording } from '../voice-recording/index.ts';
import type { VoicePlayback } from '../voice-playback/index.ts';
import { EmojiPicker, emojiIntoComposer } from '../emoji/index.ts';
import { GifSearch, mountGifPane, gifMessageUrl } from '../gif-search/index.ts';
import { prepareViewOnceSelection } from '../view-once-ui/index.ts';
import type { ExternalMediaConsent } from '../external-media/index.ts';
import { groupTextQueue } from './text-queue.ts';
import type { GroupController } from './controller.ts';
import { groupMessageView } from './message-content.ts';
import type { GroupView } from './reader.ts';
import type { TextDraft } from '../text-send/index.ts';
import type { GroupSendProgress } from './outbox.ts';

interface Options {
  controller: Pick<
    GroupController,
    | 'selected'
    | 'historyPending'
    | 'views'
    | 'composeText'
    | 'sendGroupDrafts'
    | 'stageMedia'
    | 'media'
    | 'draftMedia'
  >;
  playback: VoicePlayback;
  externalMedia?: ExternalMediaConsent | undefined;
  account: () => string | undefined;
  isBusy: () => boolean;
  sendReady?: (() => boolean) | undefined;
  textGate?: (() => QueueGate) | undefined;
  sendChanged?: (() => void) | undefined;
  sendBlockers?: (() => readonly SendWaitReason[]) | undefined;
  run: (work: () => Promise<void>) => Promise<void>;
  operationRun: (
    work: () => Promise<void>,
    diagnostic?: PrivateSendContext,
  ) => Promise<boolean | 'deferred'>;
  changed: () => void;
  reopen: () => Promise<void>;
  report: (notice: string) => void;
  progress: GroupSendProgress;
  draftChanged: (
    draft: TextDraft,
    phase: 'admitted' | 'saved' | 'save-failed',
  ) => void;
}
/** Owns the draft, reply context, previews and immutable admitted sends. */
export class GroupComposer {
  private readonly attachments: AttachmentUi;
  get media(): Pick<AttachmentUi, 'render'> {
    return { render: (input) => this.attachments.render(input) };
  }
  private readonly voice: VoiceRecording;
  readonly picker = new EmojiPicker();
  private readonly gifs: GifSearch;
  private readonly texts: ReturnType<typeof groupTextQueue>;
  private readonly submissions: AttachmentSubmissions;
  private host: HTMLElement | null = null;
  private context: { view: GroupView } | null = null;
  private lifetime = new AbortController();
  private draftGeneration = 0;
  private readonly options: Options;
  constructor(options: Options) {
    this.options = options;
    this.attachments = new AttachmentUi(
      options.playback,
      () => this.status(),
      chatFileLimit,
    );
    this.voice = new VoiceRecording({
      changed: () => this.status(),
      completed: (selection) => {
        const account = options.account();
        if (!account || !options.controller.selected) {
          selection.bytes.fill(0);
          return;
        }
        this.attachments.selectVoice(selection, account);
        this.status();
      },
    });
    this.gifs = new GifSearch(
      () =>
        options.externalMedia?.authorize('gifs', this.lifetime.signal) ??
        Promise.resolve(false),
      () => this.lifetime.signal,
    );
    this.texts = groupTextQueue({
      save: (groupId, draft) => options.controller.composeText(groupId, draft),
      send: (id, admitted) => this.transmit(id, admitted),
      observe: traceTextQueue,
      blockedBy: () => this.textGate(),
      available: () => this.sendReady() && networkAvailable(),
      changed: () => {
        this.status();
        options.sendChanged?.();
      },
      failed: (error) => this.failure(error),
      draftChanged: options.draftChanged,
      timing: (draft, stage) => tracePrivateTextQueue(draft.id, stage),
    });
    this.submissions = new AttachmentSubmissions({
      diagnosticScope: 'group',
      available: () => this.sendReady(),
      blockers: () =>
        options.sendBlockers?.() ??
        (options.isBusy() ? ['foreground-operation'] : []),
      run: (work, diagnostic) => this.runSubmission(work, diagnostic),
      stage: (item) => options.controller.stageMedia(item),
      send: (diagnostic) => this.sendSubmissions(diagnostic),
      changed: () => {
        this.status();
        options.changed();
        options.sendChanged?.();
      },
      failed: (error) => this.failure(error),
      followup: () => {},
    });
  }
  private sendReady(): boolean {
    return (
      !!this.options.account() &&
      (this.options.sendReady?.() ?? !this.options.isBusy())
    );
  }
  private textGate(): QueueGate {
    if (!this.options.account()) return 'session';
    if (!networkAvailable()) return 'offline';
    return this.options.textGate?.() ?? 'unknown';
  }
  get sendPending(): boolean {
    return this.texts.working || this.submissions.ready;
  }
  retryTexts(): void {
    this.texts.retry();
  }
  get recording(): boolean {
    return this.voice.active || !!this.attachments.selected?.voice;
  }
  canActivate(): boolean {
    return !this.voice.active && !this.attachments.selected;
  }
  mount(host: HTMLElement): void {
    this.lifetime.abort();
    this.lifetime = new AbortController();
    this.host = host;
    this.attachments.mount(host, this.options.run);
    const form = this.node<HTMLFormElement>('[data-group-compose]');
    if (!form) return;
    bindChatComposer(form, () => this.status());
    form.addEventListener(
      'submit',
      (event) => {
        event.preventDefault();
        this.submit(event);
      },
      { signal: this.lifetime.signal },
    );
    this.bind('[data-group-emoji]', () => this.emoji());
    this.bind('[data-compose-cancel]', () => this.clearContext());
    bindRecordGesture(this.node('[data-voice-record]'), {
      start: () => {
        if (
          !this.options.isBusy() &&
          !this.voice.active &&
          !this.attachments.selected
        )
          void this.voice.start();
      },
      release: () => {
        if (this.voice.state.phase === 'recording') void this.voice.stop();
      },
    });
    this.bind('[data-voice-stop]', () => void this.voice.stop());
    this.bind('[data-voice-cancel]', () => this.voice.cancel());
    window.addEventListener(
      '0xdmme-attachment-progress',
      (event) =>
        this.submissions.progress(
          (event as CustomEvent).detail as {
            message: string;
            done: number;
            total: number;
          },
        ),
      { signal: this.lifetime.signal },
    );
  }
  private node<T extends HTMLElement>(selector: string): T | null {
    return this.host?.querySelector<T>(selector) ?? null;
  }
  private bind(selector: string, work: () => void): void {
    this.node(selector)?.addEventListener('click', work, {
      signal: this.lifetime.signal,
    });
  }
  reply(view: GroupView): void {
    if (
      !this.options.controller.selected ||
      this.options.controller.selected.localOnly
    )
      return;
    this.context = { view };
    const bar = this.node('[data-compose-bar]'),
      label = this.node('[data-compose-context]'),
      input = this.node<HTMLTextAreaElement>('[data-group-text]');
    if (bar) bar.hidden = false;
    if (label)
      label.textContent = t('{0}: {1}', [
        t('Replying'),
        groupMessageView(view).content.text.slice(0, 120),
      ]);
    input?.dispatchEvent(new Event('input'));
    input?.focus({ preventScroll: true });
    this.draftGeneration++;
  }
  clearContext(): void {
    this.context = null;
    this.draftGeneration++;
    const bar = this.node('[data-compose-bar]');
    if (bar) bar.hidden = true;
    const label = this.node('[data-compose-context]');
    if (label) label.textContent = '';
  }
  status(trigger?: QueueWakeup): void {
    const controller = this.options.controller,
      form = this.node('[data-group-compose]');
    if (form) form.hidden = !!controller.selected?.localOnly;
    updateChatComposer(form, {
      blocked:
        this.options.isBusy() ||
        !controller.selected ||
        controller.historyPending,
      recording: this.voice.active,
      attachment: this.attachments.selected !== null,
      textSendBlocked: this.full(),
    });
    showRecording(form, this.voice.state);
    this.recordingControls(
      this.options.isBusy() ||
        controller.historyPending ||
        !controller.selected,
    );
    this.submissions.resume();
    this.texts.resume(trigger);
  }
  private recordingControls(blocked: boolean): void {
    const stop = this.node('[data-voice-stop]'),
      cancel = this.node('[data-voice-cancel]');
    if (stop) stop.hidden = !this.voice.active;
    if (cancel) cancel.hidden = !this.voice.active;
    const record = this.node<HTMLButtonElement>('[data-voice-record]'),
      file = this.node<HTMLInputElement>('[data-attachment-file]');
    const preparing =
      blocked || this.voice.active || this.attachments.preparing;
    if (record)
      record.disabled = preparing || this.attachments.selected !== null;
    if (file) file.disabled = preparing || !!this.attachments.selected?.voice;
  }
  private full(): boolean {
    if (this.attachments.preparing) return true;
    if (this.voice.active || !this.options.controller.selected) return true;
    return this.isMedia() ? this.submissions.full : this.texts.full;
  }
  private isMedia(): boolean {
    return (
      !!this.attachments.selected ||
      viewOnceEnabled(this.node('[data-group-compose]'))
    );
  }
  private submit(event: Event): void {
    const input = this.node<HTMLTextAreaElement>('[data-group-text]'),
      group = this.options.controller.selected;
    if (!input || !group || group.localOnly || this.full()) return;
    if (!input.value.trim() && !this.attachments.selected) return;
    this.admit(input, group.state.groupId, event);
  }
  private admit(
    input: HTMLTextAreaElement,
    groupId: string,
    event: Event,
  ): void {
    let admitted: string | undefined;
    try {
      if (this.isMedia()) {
        this.submissions.enqueue(
          {
            peer: groupId,
            text: input.value,
            reply: this.context?.view.id ?? null,
            viewOnce: viewOnceEnabled(this.node('[data-group-compose]')),
            selections: [...this.attachments.selectedBatch],
          },
          event,
        );
        this.attachments.takeSelection();
      } else {
        const id = crypto.randomUUID();
        beginPrivateSend(id, event, 'group');
        this.texts.enqueue({
          id,
          peer: groupId,
          text: encodeGroupText({
            text: input.value,
            reply: this.context?.view.id ?? null,
            forwarded: false,
          }),
        });
        traceSend('draft-admitted', id);
        admitted = id;
      }
      input.value = '';
      this.clearContext();
      input.dispatchEvent(new Event('input'));
      input.focus({ preventScroll: true });
      if (admitted) traceSend('ui-available', admitted);
    } catch (error: unknown) {
      this.failure(error);
    }
  }
  private async transmit(
    group: string,
    admitted: () => void,
  ): Promise<boolean | 'deferred'> {
    let sent = false;
    const diagnostic = privateSendBatch();
    const result = await this.options.operationRun(async () => {
      admitted();
      await this.options.controller.sendGroupDrafts(
        group,
        this.progress(group),
        diagnostic,
      );
      sent = true;
    }, diagnostic);
    return result === 'deferred' ? result : result && sent;
  }
  private progress(group: string): GroupSendProgress {
    return {
      sending: this.options.progress.sending,
      accepted: (id) => {
        this.submissions.acknowledge({ id, peer: group });
        this.options.progress.accepted(id);
      },
    };
  }
  private async runSubmission(
    work: () => Promise<void>,
    diagnostic?: PrivateSendContext,
  ): Promise<boolean> {
    let completed = false;
    let failure: { error: unknown } | null = null;
    await this.options.operationRun(async () => {
      try {
        await work();
        completed = true;
      } catch (error: unknown) {
        failure = { error };
        throw error;
      }
    }, diagnostic);
    if (failure) throw (failure as { error: unknown }).error;
    return completed;
  }
  private async sendSubmissions(
    diagnostic?: PrivateSendContext,
  ): Promise<void> {
    for (const group of new Set(this.submissionGroups()))
      await this.options.controller.sendGroupDrafts(
        group,
        this.progress(group),
        diagnostic,
      );
  }
  private submissionGroups(): string[] {
    return this.submissions.peers();
  }
  private emoji(): void {
    const anchor = this.node('[data-group-emoji]'),
      input = this.node<HTMLTextAreaElement>('[data-group-text]');
    if (!anchor || !input) return;
    void emojiIntoComposer(this.picker, anchor, input, {
      pane: (host, close) =>
        mountGifPane(host, this.gifs, (url) => {
          close();
          void this.options.run(() => this.sendGif(url));
        }),
    }).catch((error: unknown) => this.failure(error));
  }
  private async sendGif(url: string): Promise<void> {
    if (!gifMessageUrl(url)) throw new Error('Invalid GIF.');
    const group = this.options.controller.selected;
    if (!group || group.localOnly) return;
    if (viewOnceEnabled(this.node('[data-group-compose]'))) {
      const file = await this.gifs.viewOnceClip(url, chatFileLimit),
        selection = await prepareViewOnceSelection(file, chatFileLimit);
      if (this.options.controller.selected !== group) {
        selection.bytes.fill(0);
        return;
      }
      this.submissions.enqueue({
        peer: group.state.groupId,
        text: '',
        reply: null,
        viewOnce: true,
        selections: [selection],
      });
    } else
      this.texts.enqueue({
        id: crypto.randomUUID(),
        peer: group.state.groupId,
        text: encodeGroupText({
          text: url,
          reply: this.context?.view.id ?? null,
          forwarded: false,
        }),
      });
    this.clearContext();
  }
  pendingRows(shown: ReadonlySet<string>) {
    return submittedMediaRows({
      drafts: this.submissions.forPeer(
        this.options.controller.selected?.state.groupId,
      ),
      shown,
      attachments: this.attachments,
      load: (draft, thumbnail) =>
        this.options.controller.draftMedia(draft.peer, draft.id, thumbnail),
      retry: () => this.submissions.retry(),
    });
  }
  observed(history: HTMLElement, views: readonly GroupView[]): void {
    const group = this.options.controller.selected?.state.groupId;
    this.submissions.observed(group, views);
    updateSubmittedMediaStates(history, this.submissions.forPeer(group), () =>
      this.submissions.retry(),
    );
  }
  deselect(): void {
    this.clearContext();
    this.attachments.clearSelection();
    this.attachments.clearMedia();
    this.picker.close();
  }
  leave(): void {
    if (this.voice.active)
      void this.voice.stop(
        t(
          'Navigation interrupted recording. Check the excerpt when you return.',
        ),
      );
    this.attachments.clearMedia();
    this.attachments.pausePreview();
    this.picker.close();
  }
  reset(): void {
    this.voice.cancel();
    this.deselect();
    this.texts.reset();
    this.submissions.reset();
    this.picker.reset();
  }
  suspend(revoked: boolean): void {
    this.attachments.clearMedia();
    if (revoked) {
      this.voice.cancel();
      this.attachments.clearSelection();
      this.clearContext();
    }
  }
  private failure(error: unknown): void {
    this.options.report(
      error instanceof Error
        ? translatedError(error.message)
        : t('Could not complete the group operation.'),
    );
    this.status();
    this.options.changed();
  }
  bindBrowserLifetime(): void {
    window.addEventListener('beforeunload', (event) => {
      if (this.recording) {
        event.preventDefault();
        event.returnValue = '';
      }
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
}
