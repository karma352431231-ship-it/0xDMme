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
  host?: HTMLElement;
  reactions: readonly string[];
  ownReaction: string;
  action: (label: string, work: () => Promise<void>) => HTMLButtonElement;
  remove: (() => Promise<void>) | null;
}): HTMLElement {
  const host = input.host ?? document.createElement('div');
  host.className = 'message-reactions';
  host.replaceChildren();
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

/** Where a message sits in a run of one author's consecutive messages. */
export type RunPlace = 'single' | 'start' | 'middle' | 'end';
const runGap = 5 * 60_000;
/**
 * Visual B (owner, 12/11/2026): messages of one author sent within five
 * minutes of each other on the same day join one run. Its bubbles touch,
 * and only the last one carries the time and delivery checks.
 */
export function messageRuns<T>(
  rows: readonly T[],
  author: (row: T) => string,
  sentAt: (row: T) => number | undefined,
): RunPlace[] {
  const joined = (a: T | undefined, b: T | undefined): boolean => {
    if (a === undefined || b === undefined || author(a) !== author(b))
      return false;
    const first = sentAt(a),
      second = sentAt(b);
    if (first === undefined || second === undefined) return true;
    return (
      Math.abs(second - first) <= runGap &&
      dayKey(new Date(first)) === dayKey(new Date(second))
    );
  };
  return rows.map((row, index) => {
    const before = joined(rows[index - 1], row),
      after = joined(row, rows[index + 1]);
    if (before) return after ? 'middle' : 'end';
    return after ? 'start' : 'single';
  });
}

/** The start of a message as a reply or pin shows it. */
export function messageExcerpt(view: {
  kind: string;
  content: { text: string };
}): string {
  const text = view.content.text.replace(/\s+/gu, ' ').trim();
  if (text) return text.length > 120 ? `${text.slice(0, 120)}…` : text;
  return view.kind === 'attachment' ? t('Attachment') : t('Message');
}

/**
 * The card a reply shows above its own text: who wrote the original and the
 * start of it. Tapping it shows the original when the history can (visual B).
 */
export function replyQuote(input: {
  author: string | null;
  excerpt: string | null;
  open?: () => void;
}): HTMLElement {
  const card = document.createElement(input.open ? 'button' : 'div'),
    author = document.createElement('strong'),
    text = document.createElement('span');
  card.className = 'chat-reply-quote';
  if (input.open) {
    card.setAttribute('type', 'button');
    // Holding the card still opens the message options.
    card.dataset['messageHold'] = 'true';
  }
  author.textContent = input.author ? t('↩ {0}', [input.author]) : t('↩ Reply');
  text.textContent =
    input.excerpt ?? t('Original message is outside this page or unavailable.');
  card.append(author, text);
  const open = input.open;
  if (open)
    card.addEventListener('click', (event) => {
      event.stopPropagation();
      open();
    });
  return card;
}

/**
 * Updates each shown bubble's place in its run without rebuilding it: a new
 * message changes only the previous bubble's corners and time, never its
 * media (visual B).
 */
export function markRuns(
  history: HTMLElement,
  runs: ReadonlyMap<string, RunPlace>,
): void {
  for (const child of Array.from(history.children) as HTMLElement[]) {
    const id = child.dataset?.['message'],
      run = id === undefined ? undefined : runs.get(id);
    if (run && child.dataset['run'] !== run) child.dataset['run'] = run;
  }
}
