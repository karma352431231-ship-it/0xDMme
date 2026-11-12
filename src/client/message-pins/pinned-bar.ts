import { t } from '../../shared/i18n/index.ts';
import { menuIcon } from '../menu-icons/index.ts';
import { activePin } from '../daily-text/index.ts';
import type { DailyRow, DailyView } from '../daily-text/index.ts';

/** At most three pins show; the newest pins come first (owner, 12/11/2026). */
export const pinnedLimit = 3;

/** The messages currently pinned in the loaded history, newest pin first. */
export function pinnedMessages<T extends DailyRow>(
  views: readonly DailyView<T>[],
  now = Date.now(),
): DailyView<T>[] {
  return views
    .filter((view) => activePin(view.pin, now))
    .sort((a, b) => (b.pin?.sequence ?? 0) - (a.pin?.sequence ?? 0))
    .slice(0, pinnedLimit);
}

function excerpt(view: DailyView<DailyRow>): string {
  const text = view.content.text.trim();
  if (text) return text.length > 120 ? `${text.slice(0, 120)}…` : text;
  return view.kind === 'attachment' ? t('Attachment') : t('Message');
}

/**
 * The strip at the top of a chat with its pinned messages. Tapping it shows
 * the current pin in the history and moves on to the next one. The owner of
 * the conversation passes the loaded views and how to reveal a message.
 */
export class PinnedBar {
  readonly element = document.createElement('div');
  private readonly button = document.createElement('button');
  private readonly marks = document.createElement('span');
  private readonly label = document.createElement('small');
  private readonly text = document.createElement('span');
  private readonly reveal: (id: string) => void;
  private pinned: DailyView<DailyRow>[] = [];
  private index = 0;
  constructor(reveal: (id: string) => void) {
    this.reveal = reveal;
    this.element.className = 'pinned-bar';
    this.element.hidden = true;
    this.button.type = 'button';
    this.marks.className = 'pinned-marks';
    this.marks.setAttribute('aria-hidden', 'true');
    const copy = document.createElement('span');
    copy.className = 'pinned-copy';
    copy.append(this.label, this.text);
    this.button.append(this.marks, menuIcon('pin'), copy);
    this.button.addEventListener('click', () => this.next());
    this.element.append(this.button);
  }
  update<T extends DailyRow>(views: readonly DailyView<T>[]): void {
    const pinned: DailyView<DailyRow>[] = pinnedMessages(views);
    if (pinned.map((v) => v.id).join() !== this.pinned.map((v) => v.id).join())
      this.index = 0;
    this.pinned = pinned;
    this.paint();
  }
  clear(): void {
    this.pinned = [];
    this.index = 0;
    this.paint();
  }
  private paint(): void {
    const current = this.pinned[this.index];
    this.element.hidden = !current;
    if (!current) return;
    this.label.textContent =
      this.pinned.length > 1
        ? t('Pinned message {0} of {1}', [this.index + 1, this.pinned.length])
        : t('Pinned message');
    this.text.textContent = excerpt(current);
    this.marks.replaceChildren(
      ...this.pinned.map((_, index) => {
        const mark = document.createElement('i');
        if (index === this.index) mark.className = 'current';
        return mark;
      }),
    );
  }
  private next(): void {
    const current = this.pinned[this.index];
    if (!current) return;
    this.reveal(current.id);
    this.index = (this.index + 1) % this.pinned.length;
    this.paint();
  }
}
