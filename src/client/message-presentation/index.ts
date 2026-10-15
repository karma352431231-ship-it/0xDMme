import { currentLanguage, t } from '../../shared/i18n/index.ts';
import { emojiText } from '../emoji/index.ts';

export function messageTime(sentAt: number | undefined): HTMLElement | null {
  if (sentAt === undefined) return null;
  const time = document.createElement('time');
  const date = new Date(sentAt),
    language = currentLanguage();
  time.setAttribute('datetime', date.toISOString());
  time.textContent = new Intl.DateTimeFormat(language, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
  time.title = date.toLocaleString(language);
  time.setAttribute('aria-label', t('message.sent-at', [time.title]));
  return time;
}
/** One chip per emoji; only the current author's choice is removable. */
export function messageReactions(input: {
  reactions: readonly string[];
  ownReaction: string;
  action: (label: string, work: () => Promise<void>) => HTMLButtonElement;
  remove: (() => Promise<void>) | null;
}): HTMLElement {
  const host = document.createElement('div');
  host.className = 'message-reactions';
  const counts = new Map<string, number>();
  for (const emoji of input.reactions)
    counts.set(emoji, (counts.get(emoji) ?? 0) + 1);
  for (const [emoji, count] of counts) {
    const own = emoji === input.ownReaction;
    const button = input.action(
      t(own ? 'message.remove-reaction' : 'message.reaction', [emoji, count]),
      async () => {
        if (own && input.remove) await input.remove();
      },
    );
    button.disabled = !own || !input.remove;
    button.className = 'message-reaction';
    button.setAttribute('aria-label', button.textContent ?? '');
    button.setAttribute('aria-pressed', String(own));
    emojiText(button, emoji);
    if (count > 1) button.append(` ${count}`);
    host.append(button);
  }
  return host;
}
