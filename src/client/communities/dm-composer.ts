import { t, translatedError } from '../../shared/i18n/index.ts';
import type { SocialMedia } from '../../shared/social-media/index.ts';
import type { AttachmentSelection } from '../attachments/index.ts';
import {
  bindChatComposer,
  bindRecordGesture,
  showRecording,
  updateChatComposer,
  viewOnceEnabled,
} from '../chat-ui/index.ts';
import { EmojiPicker, emojiIntoComposer } from '../emoji/index.ts';
import type { ExternalMediaConsent } from '../external-media/index.ts';
import { dropFilesInto } from '../file-drop/index.ts';
import { GifSearch, mountGifPane } from '../gif-search/index.ts';
import { prepareSocialImage } from '../social-media/index.ts';
import { showToast } from '../toast/index.ts';
import type { VoicePlayback } from '../voice-playback/index.ts';
import { VoiceRecording } from '../voice-recording/index.ts';
import type { DmView } from './dm-chat.ts';
import { DmComposition } from './dm-composition.ts';
import { DmDrafts } from './dm-drafts.ts';
import { prepareViewOnceSelection } from '../view-once-ui/index.ts';

export interface ChosenMedia {
  viewOnceOnly?: boolean;
  selection: AttachmentSelection;
  media: SocialMedia;
}
const previewId = 'dm-voice-preview';

/**
 * The public @ composer behaves like the private one: a chosen photo, GIF or
 * recorded voice stays in this page's memory with a preview until Enviar,
 * which prepares and sends it with the typed text as its caption.
 */
export function startDmComposer(options: {
  playback: VoicePlayback;
  privacy: ExternalMediaConsent;
  run: (work: () => Promise<void>) => Promise<void>;
  /** Sends text and/or media; `pending` resumes media saved on this device. */
  submit: (input: {
    peer: string;
    text: string;
    media: ChosenMedia | null;
    pending: boolean;
    editing: DmComposition['target'];
    replying: string | null;
    viewOnce?: boolean;
  }) => Promise<void>;
  queueText?: (text: string, reply: string | null) => void;
  queueFull?: () => boolean;
  discardPending: (peer: string) => Promise<void>;
}) {
  let view: DmView | null = null,
    bound: string | null = null,
    unloadGuarded = false,
    chosen: ChosenMedia | null = null,
    pending = false,
    writable = false,
    busy = false,
    previewUrl: string | null = null;
  let draftRevision = 0,
    mediaRevision = 0;
  let queued: Submission | null = null;
  let abort = new AbortController();
  const emoji = new EmojiPicker();
  const composition = new DmComposition();
  const drafts = new DmDrafts();
  const gifs = new GifSearch(
    () => options.privacy.authorize('gifs', abort.signal),
    () => AbortSignal.any([abort.signal, options.privacy.signal]),
  );
  const recording = new VoiceRecording({
    changed: (state) => {
      showRecording(view?.form ?? null, state);
      sync();
    },
    completed: (selection) => {
      if (!view || !writable) {
        selection.bytes.fill(0);
        return;
      }
      choose({ selection, media: 'voice' });
    },
  });
  function node<T extends HTMLElement>(selector: string): T | null {
    return view?.form.querySelector<T>(selector) ?? null;
  }
  function sync(): void {
    if (!view) return;
    view.form.hidden = !writable;
    updateChatComposer(view.form, {
      blocked: controlsBlocked(),
      recording: recording.active,
      attachment: chosen !== null || pending,
      textSendBlocked: canQueueText() ? options.queueFull?.() : undefined,
    });
    syncMediaControls();
    for (const selector of ['[data-voice-stop]', '[data-voice-cancel]']) {
      const control = node(selector);
      if (control) control.hidden = !recording.active;
    }
  }
  function controlsBlocked(): boolean {
    return busy || queued !== null || !writable;
  }
  function canRecord(): boolean {
    return (
      !controlsBlocked() &&
      !chosen &&
      !pending &&
      !recording.active &&
      !composition.target
    );
  }
  function syncMediaControls(): void {
    const blocked = controlsBlocked() || composition.target !== null;
    const record = node<HTMLButtonElement>('[data-voice-record]');
    if (record) record.disabled = !canRecord();
    const file = node<HTMLInputElement>('[data-attachment-file]');
    if (file) file.disabled = blocked;
    node<HTMLButtonElement>('[data-chat-attachment]')?.toggleAttribute(
      'disabled',
      blocked,
    );
  }
  function releasePreview(): void {
    options.playback.release(previewId);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;
    node('[data-attachment-preview]')?.replaceChildren();
  }
  function wipeMedia(media: ChosenMedia | null): void {
    media?.selection.bytes.fill(0);
    media?.selection.thumbnail?.fill(0);
  }
  function discardChosen(): void {
    queued = null;
    mediaRevision++;
    wipeMedia(chosen);
    chosen = null;
    releasePreview();
  }
  function choose(value: ChosenMedia): void {
    draftRevision++;
    discardChosen();
    chosen = value;
    preview();
    sync();
    if (matchMedia('(pointer: fine)').matches) view?.text.focus();
  }
  function preview(): void {
    const area = node('[data-attachment-preview]');
    if (!area) return;
    if (pending && !chosen) {
      area.replaceChildren(
        Object.assign(document.createElement('p'), {
          textContent: t('Media pending on this device. Send or remove it.'),
        }),
      );
      return;
    }
    if (!chosen) return;
    const { selection } = chosen;
    if (!selection.image && !selection.voice) {
      area.textContent = selection.name;
      return;
    }
    if (selection.voice) {
      const voice = selection.voice;
      area.replaceChildren(
        options.playback.element({
          id: previewId,
          voice,
          load: () => {
            options.playback.play({
              bytes: selection.bytes,
              voice,
              id: previewId,
              peer: null,
            });
            return Promise.resolve();
          },
        }),
      );
      return;
    }
    const image = document.createElement('img');
    previewUrl = URL.createObjectURL(
      new Blob([selection.bytes], { type: selection.type }),
    );
    image.src = previewUrl;
    image.alt = t('Selected image preview');
    area.replaceChildren(image);
  }
  function canQueueText(): boolean {
    return Boolean(
      options.queueText &&
      writable &&
      queued === null &&
      !recording.active &&
      !chosen &&
      !pending &&
      !viewOnceEnabled(view?.form ?? null) &&
      !composition.target,
    );
  }
  function queueText(): boolean {
    if (!view || !canQueueText() || !view.text.value.trim()) return false;
    if (options.queueFull?.()) return true;
    options.queueText!(view.text.value, composition.replying?.id ?? null);
    view.text.value = composition.finish();
    view.text.dispatchEvent(new Event('input'));
    view.text.focus({ preventScroll: true });
    return true;
  }
  function captureSubmission() {
    if (!view || !bound || controlsBlocked() || recording.active) return null;
    const once = viewOnceEnabled(view.form),
      text = view.text.value,
      media = chosen;
    if (!text.trim() && !media && !pending) return null;
    assertMediaMode(once, media);
    return {
      once,
      text,
      media,
      current: view,
      recipient: bound,
      revision: draftRevision,
      pending: pending && !media,
      editing: composition.target,
      replying: composition.replying?.id ?? null,
    };
  }
  type Submission = NonNullable<ReturnType<typeof captureSubmission>>;
  function currentDraft(input: Submission): boolean {
    return (
      view === input.current &&
      bound === input.recipient &&
      draftRevision === input.revision
    );
  }
  async function send(): Promise<void> {
    const input = captureSubmission();
    if (!input) return;
    // The foreground read can already own the turn. Keep the preview until
    // this submission starts, so a skipped or invalidated turn loses no draft.
    queued = input;
    sync();
    try {
      await options.run(async () => {
        if (queued !== input || !writable) return;
        queued = null;
        chosen = null;
        mediaRevision++;
        await sendCaptured(input);
      });
    } finally {
      if (queued === input) {
        queued = null;
        sync();
      }
    }
  }
  async function sendCaptured(input: Submission): Promise<void> {
    let admitted = false;
    try {
      await options.submit({
        peer: input.recipient,
        text: input.text,
        media: input.media,
        pending: input.pending,
        viewOnce: input.once,
        editing: input.editing,
        replying: input.replying,
      });
      admitted = true;
    } finally {
      finishMedia({ ...input, admitted });
    }
    if (!currentDraft(input)) return;
    pending = false;
    input.current.text.value = composition.finish();
    input.current.text.dispatchEvent(new Event('input'));
  }
  function assertMediaMode(once: boolean, media: ChosenMedia | null): void {
    if (!once && media?.viewOnceOnly)
      throw new Error(
        'Enable view once to send this selected file, or remove it.',
      );
  }
  function finishMedia(input: Submission & { admitted: boolean }): void {
    if (
      input.once &&
      !input.admitted &&
      currentDraft(input) &&
      writable &&
      !chosen
    )
      chosen = input.media;
    else {
      wipeMedia(input.media);
      if (view === input.current && bound === input.recipient && !chosen)
        releasePreview();
    }
  }
  function hasUnsent(): boolean {
    return (
      composition.target !== null ||
      composition.replying !== null ||
      Boolean(view?.text.value.trim()) ||
      drafts.size > 0
    );
  }
  /** Kept drafts live in memory, so a reload asks first; registered once. */
  function guardUnload(): void {
    if (unloadGuarded) return;
    unloadGuarded = true;
    window.addEventListener('beforeunload', (event) => {
      if (!hasUnsent()) return;
      event.preventDefault();
      event.returnValue = '';
    });
  }
  function restore(next: DmView, peer: string): void {
    const text = drafts.take(peer);
    if (!text) return;
    next.text.value = text;
    next.text.dispatchEvent(new Event('input'));
  }
  function bindMedia(current: DmView): void {
    const input = node<HTMLInputElement>('[data-attachment-file]');
    if (!input) return;
    input.accept = 'image/png,image/jpeg,image/webp,image/gif';
    dropFilesInto(current.panel, input);
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      input.value = '';
      if (!file || composition.target) return;
      const recipient = bound,
        preparationRevision = ++mediaRevision;
      const preparation = viewOnceEnabled(current.form)
        ? prepareViewOnceSelection(file, 3_000_000).then((selection) => ({
            selection,
            media:
              selection.type === 'image/gif'
                ? ('gif' as const)
                : ('photo' as const),
            viewOnceOnly: true,
          }))
        : prepareSocialImage(file);
      void preparation
        .then((value) => {
          if (
            view === current &&
            writable &&
            bound === recipient &&
            mediaRevision === preparationRevision
          )
            choose(value);
          else wipeMedia(value);
        })
        .catch((error: unknown) => {
          showToast(
            error instanceof Error
              ? translatedError(error.message)
              : t('Invalid image.'),
          );
        });
    });
    node('[data-attachment-clear]')?.addEventListener('click', () => {
      if (chosen) {
        discardChosen();
        sync();
        return;
      }
      const recipient = bound,
        revision = draftRevision;
      if (pending && recipient)
        void options.run(async () => {
          await options.discardPending(recipient);
          if (
            view !== current ||
            bound !== recipient ||
            revision !== draftRevision
          )
            return;
          pending = false;
          releasePreview();
          sync();
        });
    });
  }
  function bindVoice(): void {
    bindRecordGesture(node('[data-voice-record]'), {
      start: () => {
        if (canRecord()) void recording.start();
      },
      release: () => {
        if (recording.state.phase === 'recording') void recording.stop();
      },
      signal: abort.signal,
    });
    node('[data-voice-stop]')?.addEventListener('click', () => {
      void recording.stop();
    });
    node('[data-voice-cancel]')?.addEventListener('click', () => {
      recording.cancel();
    });
  }
  function bindEmoji(current: DmView): void {
    const anchor = node('[data-public-emoji]');
    anchor?.addEventListener('click', () => {
      void emojiIntoComposer(emoji, anchor, current.text, {
        pane: (host, close) => {
          mountGifPane(host, gifs, (url) => {
            close();
            const recipient = bound,
              replying = composition.replying?.id ?? null,
              once = viewOnceEnabled(current.form);
            if (!recipient || view !== current) return;
            if (once) {
              void options.run(async () => {
                const file = await gifs.viewOnceClip(url, 3_000_000);
                const selection = await prepareViewOnceSelection(
                  file,
                  3_000_000,
                );
                try {
                  if (view === current && writable && bound === recipient)
                    await options.submit({
                      peer: recipient,
                      editing: null,
                      replying,
                      text: '',
                      media: { selection, media: 'gif', viewOnceOnly: true },
                      pending: false,
                      viewOnce: true,
                    });
                } finally {
                  selection.bytes.fill(0);
                }
              });
              return;
            }
            // A GIF is its KLIPY link, sent as the usual E2EE text.
            if (options.queueText && canQueueText()) {
              try {
                options.queueText(url, replying);
              } catch (error: unknown) {
                showToast(
                  error instanceof Error
                    ? translatedError(error.message)
                    : t('DM unavailable.'),
                );
              }
            } else
              void options.run(() =>
                options.submit({
                  peer: recipient,
                  editing: null,
                  replying,
                  text: url,
                  media: null,
                  pending: false,
                  viewOnce: once,
                }),
              );
          });
        },
      }).catch(() => {
        showToast(t('Could not open emoji.'));
      });
    });
  }
  return {
    /** Binds a freshly built conversation; a refresh reuses the same view. */
    bind(next: DmView, peer: string): void {
      emoji.close();
      view = next;
      bound = peer;
      composition.bind(next.form, next.text, sync);
      restore(next, peer);
      guardUnload();
      bindChatComposer(next.form, sync);
      next.text.addEventListener('input', () => {
        draftRevision++;
      });
      next.form.addEventListener('submit', (event) => {
        event.preventDefault();
        try {
          if (!queueText())
            void send().catch((error: unknown) =>
              showToast(
                error instanceof Error
                  ? translatedError(error.message)
                  : t('Could not complete the operation.'),
              ),
            );
        } catch (error: unknown) {
          showToast(
            error instanceof Error
              ? translatedError(error.message)
              : t('Could not complete the operation.'),
          );
        }
      });
      bindMedia(next);
      bindVoice();
      bindEmoji(next);
      sync();
    },
    update(state: {
      writable: boolean;
      pending: boolean;
      busy: boolean;
    }): void {
      busy = state.busy;
      writable = state.writable;
      if (!writable) {
        queued = null;
        recording.cancel();
      }
      if (pending !== state.pending && !chosen) {
        pending = state.pending;
        releasePreview();
        preview();
      }
      sync();
    },
    /** An unsent text kept by the device is shown again once. */
    restoreDraft(text: string): void {
      if (view && !view.text.value && text) {
        view.text.value = text;
        view.text.dispatchEvent(new Event('input'));
      }
    },
    get active(): boolean {
      return recording.active || chosen !== null;
    },
    /** Typed text, an edit in progress or a kept draft of another conversation. */
    get unsent(): boolean {
      return hasUnsent();
    },
    /** Drafts belong to the session that typed them. */
    forgetDrafts(): void {
      drafts.clear();
    },
    get editing() {
      return composition.target;
    },
    get replying() {
      return composition.replying?.id ?? null;
    },
    reply(target: Parameters<DmComposition['reply']>[0]): void {
      if (!writable || recording.active || chosen || pending) return;
      draftRevision++;
      composition.reply(target);
      sync();
    },
    edit(target: Parameters<DmComposition['choose']>[0]): void {
      if (!writable || busy || recording.active || chosen || pending) return;
      composition.choose(target);
      sync();
    },
    cancelEdit(): void {
      draftRevision++;
      composition.cancel();
    },
    leave(): void {
      draftRevision++;
      emoji.close();
      if (view && bound) drafts.keep(bound, composition.unsent());
      bound = null;
      composition.clear();
      recording.cancel();
      discardChosen();
      abort.abort();
      abort = new AbortController();
      pending = false;
      writable = false;
      view = null;
    },
  };
}
