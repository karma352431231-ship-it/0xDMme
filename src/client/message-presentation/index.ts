import { currentLanguage, t } from '../../shared/i18n/index.ts';
import { emojiText } from '../emoji/index.ts';

export function messageTime(sentAt: number | undefined): HTMLElement | null {
  if (sentAt === undefined) return null;
  const time = document.createElement('time');
  const date = new Date(sentAt),
    language = currentLanguage();
  time.setAttribute('datetime', date.toISOString());
  time.textContent = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(date);
  time.title = date.toLocaleString(language);
  time.setAttribute('aria-label', t('message.sent-at {0}', [time.title]));
  return time;
}
/** The local calendar day of a sent time (owner request, 24/10/2026):
 * messages from 00:00 to 23:59 belong to one day. `key` identifies the day;
 * `label` reads "Today", "Yesterday" or the date, with the year only when it
 * is not the current one. */
export function messageDay(
  sentAt: number,
  now = Date.now(),
): { key: string; label: string } {
  const date = new Date(sentAt),
    today = new Date(now),
    key = dayKey(date);
  if (key === dayKey(today)) return { key, label: t('Today') };
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (key === dayKey(yesterday)) return { key, label: t('Yesterday') };
  return {
    key,
    label: new Intl.DateTimeFormat(currentLanguage(), {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      ...(date.getFullYear() === today.getFullYear()
        ? {}
        : { year: 'numeric' as const }),
    }).format(date),
  };
}
function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}
/** A heading before the first message of each day; rows without a time stay
 * in the day of the message before them. */
export function withDayHeadings<R>(
  rows: readonly R[],
  sentAt: (row: R) => number | undefined,
  heading: (day: { key: string; label: string }) => R,
): R[] {
  const result: R[] = [];
  let current: string | null = null;
  const now = Date.now();
  for (const row of rows) {
    const time = sentAt(row);
    if (time !== undefined) {
      const day = messageDay(time, now);
      if (day.key !== current) result.push(heading(day));
      current = day.key;
    }
    result.push(row);
  }
  return result;
}
export function dayHeading(label: string): HTMLElement {
  const heading = document.createElement('div'),
    text = document.createElement('span');
  heading.className = 'chat-day';
  heading.setAttribute('role', 'separator');
  heading.dataset['day'] = '';
  text.textContent = label;
  heading.append(text);
  return heading;
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
      t(own ? 'message.remove-reaction {0} {1}' : 'message.reaction {0} {1}', [
        emoji,
        count,
      ]),
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
