import { t, translatedError } from '../../shared/i18n/index.ts';
import type { SocialMedia } from '../../shared/social-media/index.ts';
import type { AttachmentSelection } from '../attachments/index.ts';
import {
  bindChatComposer,
  bindRecordGesture,
  showRecording,
  updateChatComposer,
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

export interface ChosenMedia {
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
    text: string;
    media: ChosenMedia | null;
    pending: boolean;
  }) => Promise<void>;
  discardPending: () => Promise<void>;
  changed: () => void;
}) {
  let view: DmView | null = null,
    chosen: ChosenMedia | null = null,
    pending = false,
    writable = false,
    busy = false,
    previewUrl: string | null = null;
  let abort = new AbortController();
  const emoji = new EmojiPicker();
  const composition = new DmComposition();
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
      blocked: busy || !writable,
      recording: recording.active,
      attachment: chosen !== null || pending,
    });
    syncMediaControls();
    for (const selector of ['[data-voice-stop]', '[data-voice-cancel]']) {
      const control = node(selector);
      if (control) control.hidden = !recording.active;
    }
    options.changed();
  }
  function syncMediaControls(): void {
    const record = node<HTMLButtonElement>('[data-voice-record]');
    if (record)
      record.disabled =
        busy || chosen !== null || pending || composition.target !== null;
    const file = node<HTMLInputElement>('[data-attachment-file]');
    if (file) file.disabled = busy || composition.target !== null;
    node<HTMLButtonElement>('[data-chat-attachment]')?.toggleAttribute(
      'disabled',
      busy || composition.target !== null,
    );
  }
  function releasePreview(): void {
    options.playback.release(previewId);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;
    node('[data-attachment-preview]')?.replaceChildren();
  }
  function discardChosen(): void {
    chosen?.selection.bytes.fill(0);
    chosen?.selection.thumbnail?.fill(0);
    chosen = null;
    releasePreview();
  }
  function choose(value: ChosenMedia): void {
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
  async function send(): Promise<void> {
    if (!view || !writable) return;
    const text = view.text.value,
      media = chosen;
    if (!text.trim() && !media && !pending) return;
    chosen = null;
    try {
      await options.submit({ text, media, pending: pending && !media });
    } finally {
      media?.selection.bytes.fill(0);
      media?.selection.thumbnail?.fill(0);
      releasePreview();
    }
    pending = false;
    composition.clear();
    view.text.value = '';
    view.text.dispatchEvent(new Event('input'));
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
      void prepareSocialImage(file)
        .then((value) => {
          if (view === current && writable) choose(value);
          else value.selection.bytes.fill(0);
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
      if (pending)
        void options.run(async () => {
          await options.discardPending();
          pending = false;
          releasePreview();
          sync();
        });
    });
  }
  function bindVoice(): void {
    bindRecordGesture(node('[data-voice-record]'), {
      start: () => {
        if (
          !busy &&
          writable &&
          !chosen &&
          !pending &&
          !recording.active &&
          !composition.target
        )
          void recording.start();
      },
      release: () => {
        if (recording.state.phase === 'recording') void recording.stop();
      },
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
            // A GIF is its KLIPY link, sent as the usual E2EE text.
            void options.run(() =>
              options.submit({ text: url, media: null, pending: false }),
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
    bind(next: DmView): void {
      view = next;
      composition.bind(next.form, next.text, sync);
      bindChatComposer(next.form, sync);
      next.form.addEventListener('submit', (event) => {
        event.preventDefault();
        void options.run(send);
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
      if (!writable) recording.cancel();
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
    get editing() {
      return composition.target;
    },
    edit(target: Parameters<DmComposition['choose']>[0]): void {
      if (!writable || busy || recording.active || chosen || pending) return;
      composition.choose(target);
      sync();
    },
    cancelEdit(): void {
      composition.cancel();
    },
    leave(): void {
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
