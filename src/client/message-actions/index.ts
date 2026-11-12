export { HistoryReactions } from './reactions.ts';
import { t, translatedError } from '../../shared/i18n/index.ts';
import type { Peer } from '../../shared/contacts/index.ts';
import type { DailyRow, DailyView } from '../daily-text/index.ts';
import type { EmojiPicker } from '../emoji/index.ts';
import { anchoredMessageMenu } from '../message-menu/index.ts';
import { withMenuIcon } from '../menu-icons/index.ts';
import { showToast } from '../toast/index.ts';
import { activePin } from '../daily-text/index.ts';
import { choosePinDuration } from '../message-pins/index.ts';
interface MessageActionOptions<T extends DailyRow> {
  signal: AbortSignal;
  view: DailyView<T>;
  peers: readonly Peer[];
  replyAllowed?: boolean;
  forwardAllowed?: boolean;
  action: (label: string, work: () => Promise<void>) => HTMLButtonElement;
  choose: (mode: 'reply' | 'edit', view: T) => void;
  react: (view: T, reaction: string) => Promise<void>;
  picker: Pick<EmojiPicker, 'choose'>;
  forward: (view: DailyView<T>) => void;
  remove?: () => Promise<void>;
  removeLabel?: string;
  row?: HTMLElement;
  /** Pins for everyone until the given time, or unpins with 0; absent when
   * this person may not pin here. */
  pin?: (until: number) => Promise<void>;
  /** The person's own starred list, synced through their vault. */
  star?: { starred: boolean; toggle: () => Promise<void> };
}
export function messageActions<T extends DailyRow>(
  c: MessageActionOptions<T>,
): HTMLElement {
  if (c.view.kind === 'profile' && !c.remove)
    return document.createElement('div');
  const { host, panel: menu, trigger } = anchoredMessageMenu(gestureOptions(c));
  trigger.dataset['draftAction'] = 'true';
  if (c.view.kind === 'profile') {
    appendRemove(menu, c);
    return host;
  }
  if (c.replyAllowed !== false)
    menu.append(withMenuIcon(replyButton(c), 'reply'));
  if (
    !c.view.archived &&
    c.view.own &&
    c.view.kind === 'text' &&
    !c.view.content.viewOnce
  )
    menu.append(
      withMenuIcon(
        c.action(t('Edit'), () => {
          c.choose('edit', c.view);
          return Promise.resolve();
        }),
        'edit',
      ),
    );
  appendCopy(menu, c);
  appendStar(menu, c);
  appendPin(menu, c);
  const reaction = c.action(t('React…'), async () => {
    const emoji = await c.picker.choose(trigger);
    if (emoji !== null && !c.signal.aborted) await c.react(c.view, emoji);
  });
  if (!c.view.archived) menu.append(withMenuIcon(reaction, 'react'));
  appendForward(menu, c);
  appendRemove(menu, c);
  return host;
}
function replyButton<T extends DailyRow>(
  c: MessageActionOptions<T>,
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset['draftAction'] = 'true';
  button.textContent = t('Reply');
  button.addEventListener('click', () => c.choose('reply', c.view), {
    signal: c.signal,
  });
  return button;
}

/** Touch affordances use the same reply capability as the visible menu. */
function gestureOptions<T extends DailyRow>(c: MessageActionOptions<T>) {
  return {
    signal: c.signal,
    ...(c.row ? { row: c.row } : {}),
    ...(c.replyAllowed !== false && c.view.kind !== 'profile'
      ? { reply: () => c.choose('reply', c.view) }
      : {}),
  };
}

/** Copies the visible text (a caption for attachments) on this device only.
 * The clipboard call stays inside the click: browsers refuse it once queued. */
function appendCopy<T extends DailyRow>(
  menu: HTMLElement,
  c: MessageActionOptions<T>,
): void {
  const text = c.view.content.text;
  if (!text || !['text', 'attachment'].includes(c.view.kind)) return;
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.textContent = t('Copy text');
  copy.addEventListener('click', () => {
    navigator.clipboard.writeText(text).then(
      () => showToast(t('Text copied.'), { success: true }),
      () => showToast(t('Could not copy the text.')),
    );
  });
  menu.append(withMenuIcon(copy, 'copy'));
}

/** Pinning keeps a message on top for everyone; a view-once never stays. */
function appendPin<T extends DailyRow>(
  menu: HTMLElement,
  c: MessageActionOptions<T>,
): void {
  const pin = c.pin;
  if (!pin || c.view.archived || c.view.content.viewOnce) return;
  if (activePin(c.view.pin)) {
    menu.append(
      withMenuIcon(
        personalAction(t('Unpin'), () => pin(0)),
        'unpin',
      ),
    );
    return;
  }
  menu.append(
    withMenuIcon(
      personalAction(t('Pin'), async () => {
        const until = await choosePinDuration();
        if (until !== null && !c.signal.aborted) await pin(until);
      }),
      'pin',
    ),
  );
}

/**
 * Pins and stars show at once and finish in the background, as in WhatsApp:
 * they never take the chat's busy lane, which waits for maintenance and
 * disables the conversation (12/11/2026). The capability undoes its own
 * early display when the change fails; the menu only reports the failure.
 */
function personalAction(
  label: string,
  work: () => Promise<void>,
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.addEventListener('click', () => {
    work().catch((error: unknown) =>
      showToast(
        error instanceof Error
          ? translatedError(error.message)
          : t('Could not complete the operation.'),
      ),
    );
  });
  return button;
}

function appendStar<T extends DailyRow>(
  menu: HTMLElement,
  c: MessageActionOptions<T>,
): void {
  const star = c.star;
  if (!star || c.view.content.viewOnce) return;
  menu.append(
    withMenuIcon(
      personalAction(star.starred ? t('Unstar') : t('Star'), star.toggle),
      star.starred ? 'unstar' : 'star',
    ),
  );
}

function appendForward<T extends DailyRow>(
  menu: HTMLElement,
  c: MessageActionOptions<T>,
): void {
  if (
    (c.forwardAllowed ?? c.peers.length > 0) &&
    ['text', 'attachment'].includes(c.view.kind) &&
    !c.view.content.viewOnce
  )
    menu.append(
      withMenuIcon(
        c.action(t('Forward'), () => {
          c.forward(c.view);
          return Promise.resolve();
        }),
        'forward',
      ),
    );
}

function appendRemove<T extends DailyRow>(
  menu: HTMLElement,
  c: MessageActionOptions<T>,
): void {
  if (c.remove)
    menu.append(
      withMenuIcon(
        c.action(c.removeLabel ?? t('Delete for both'), c.remove),
        'trash',
      ),
    );
}
