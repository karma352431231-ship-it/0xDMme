import { t } from '../../shared/i18n/index.ts';
import { sendOnEnter } from './enter.ts';
import { startTransientMenus } from '../transient-menu/index.ts';
import { pingChipMarkup, pingMarkup } from '../ping/index.ts';

const icons = {
  back: '<path d="m14 6-6 6 6 6"/>',
  more: '<circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>',
  phone:
    '<path d="M7 3H4a1 1 0 0 0-1 1c0 9.4 7.6 17 17 17a1 1 0 0 0 1-1v-3l-5-2-2 2a15 15 0 0 1-7-7l2-2z"/>',
  emoji:
    '<circle cx="12" cy="12" r="9"/><path d="M8 14a4 4 0 0 0 8 0M8 9h.01M16 9h.01"/>',
  clip: '<path d="m8 12 7-7a3 3 0 0 1 4 4L9 19a5 5 0 0 1-7-7L12 2m-6 12 9-9"/>',
  mic: '<rect x="9" y="2" width="6" height="13" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/>',
  send: '<path d="m3 3 18 9-18 9 3-9zM6 12h15"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  stop: '<rect x="7" y="7" width="10" height="10" rx="2"/>',
  collapse: '<path d="M20 12H9M13 7l-5 5 5 5M4 5v14"/>',
} as const;

export { bindRecordGesture, showRecording } from './voice.ts';
export { sendOnEnter } from './enter.ts';

export function chatIcon(name: keyof typeof icons): string {
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name]}</svg>`;
}

export function directChat(): string {
  return t('html.3b20f44af6d9', [
    chatIcon('back'),
    chatIcon('phone'),
    chatIcon('more'),
    chatCollapse(),
    chatComposer('message'),
    pingMarkup('hello', 'lg'),
    pingChipMarkup('salute', t('chat.encrypted-on-device')),
  ]);
}

/** Desktop workspace control; hidden by CSS where the chat column cannot collapse. */
export function chatCollapse(): string {
  return t('html.266effed7cb6', [chatIcon('collapse')]);
}

/** Authored markup only. Account names and decrypted text never enter this template. */
export function chatComposer(scope: 'message' | 'group' | 'public'): string {
  const form = {
    message: 'message-form',
    group: 'group-compose',
    public: 'public-compose',
  }[scope];
  return t('html.46729037ae98', [
    form,
    scope === 'message' ? t('html.2e7c749dbe8a', [chatIcon('close')]) : '',
    chatIcon('trash'),
    chatIcon('trash'),
    chatIcon('stop'),
    scope,
    chatIcon('emoji'),
    scope,
    chatIcon('clip'),
    chatIcon('mic'),
    chatIcon('send'),
  ]);
}

export function composerState(input: {
  text: string;
  attachment: boolean;
  recording: boolean;
  blocked: boolean;
}): { send: boolean; record: boolean; disabled: boolean } {
  const content = input.text.trim().length > 0 || input.attachment;
  return {
    send: content && !input.recording,
    record: !content && !input.recording,
    disabled: input.blocked || input.recording,
  };
}

export function updateChatComposer(
  form: HTMLElement | null,
  input: { blocked: boolean; recording: boolean; attachment: boolean },
): void {
  if (!form) return;
  const text = form.querySelector<HTMLTextAreaElement>('textarea');
  const state = composerState({ ...input, text: text?.value ?? '' });
  const send = form.querySelector<HTMLButtonElement>('[data-compose-send]');
  if (send) {
    send.hidden = !state.send;
    send.disabled = state.disabled;
  }
  const record = form.querySelector<HTMLElement>('[data-voice-record]');
  if (record) record.hidden = !state.record;
  const clear = form.querySelector<HTMLElement>('[data-attachment-clear]');
  if (clear) clear.hidden = !input.attachment;
  // Draft typing is local. Keep the keyboard/focus during background sync;
  // sending and media actions remain blocked until the verified history opens.
  if (text) text.disabled = input.recording;
  form
    .querySelectorAll<HTMLButtonElement>(
      '[data-chat-attachment], [data-message-emoji], [data-group-emoji], [data-public-emoji]',
    )
    .forEach((button) => {
      button.disabled = state.disabled;
    });
  form.dataset['recording'] = String(input.recording);
}

export function bindChatComposer(form: HTMLElement, changed: () => void): void {
  const text = form.querySelector<HTMLTextAreaElement>('textarea');
  const resize = () => {
    if (text) {
      text.style.height = 'auto';
      text.style.height = `${Math.min(text.scrollHeight, 128)}px`;
    }
    changed();
  };
  text?.addEventListener('input', resize);
  // Text, a photo or a voice preview: Enter sends whatever Enviar would send.
  if (text)
    sendOnEnter(text, () => {
      const send = form.querySelector<HTMLButtonElement>('[data-compose-send]');
      if (send && !send.hidden && !send.disabled) send.click();
    });
  form
    .querySelectorAll<HTMLButtonElement>('[data-chat-attachment]')
    .forEach((button) => {
      button.addEventListener('click', () => {
        const file = form.querySelector<HTMLInputElement>(
          '[data-attachment-file]',
        );
        if (!file || file.disabled) return;
        file.click();
      });
    });
}

export function bindChatOptions(host: HTMLElement): void {
  startTransientMenus(host.ownerDocument);
}

/** Receipts never replace a bubble, its media, actions or reading position. */
export function updateMessageStates(
  history: HTMLElement | null,
  states: ReadonlyMap<string, HTMLElement>,
): void {
  history
    ?.querySelectorAll<HTMLElement>('[data-message]')
    .forEach((article) => {
      const previous = article.querySelector('.message-meta'),
        next = states.get(article.dataset['message'] ?? '');
      if (previous && next && !previous.isEqualNode(next))
        previous.replaceWith(next);
    });
}

/** Keep the reading position on refresh; only follow messages when already at the bottom. */
const positions = new WeakMap<HTMLElement, { top: number; follow: boolean }>();
const newConversations = new WeakSet<HTMLElement>();

export function resetHistoryPosition(history: HTMLElement | null): void {
  if (history) newConversations.add(history);
}

export function historyPosition(history: HTMLElement): () => void {
  if (newConversations.delete(history)) {
    positions.set(history, { top: 0, follow: true });
  } else if (!history.hidden) {
    const top = history.scrollTop;
    positions.set(history, {
      top,
      follow:
        history.childElementCount === 0 ||
        history.scrollHeight - top - history.clientHeight < 80,
    });
  }
  const position = positions.get(history) ?? { top: 0, follow: true };
  return () => {
    if (!history.hidden)
      history.scrollTop = position.follow ? history.scrollHeight : position.top;
  };
}
