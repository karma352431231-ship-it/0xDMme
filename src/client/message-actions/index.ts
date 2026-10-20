import { t } from '../../shared/i18n/index.ts';
import type { Peer } from '../../shared/contacts/index.ts';
import type { DailyRow, DailyView } from '../daily-text/index.ts';
import type { EmojiPicker } from '../emoji/index.ts';
import { anchoredMessageMenu } from '../message-menu/index.ts';
import { withMenuIcon } from '../menu-icons/index.ts';
interface MessageActionOptions<T extends DailyRow> {
  signal: AbortSignal;
  view: DailyView<T>;
  peers: readonly Peer[];
  replyAllowed?: boolean;
  action: (label: string, work: () => Promise<void>) => HTMLButtonElement;
  choose: (mode: 'reply' | 'edit', view: T) => void;
  react: (view: T, reaction: string) => Promise<void>;
  picker: EmojiPicker;
  forward: (view: DailyView<T>) => void;
  remove?: () => Promise<void>;
}
export function messageActions<T extends DailyRow>(
  c: MessageActionOptions<T>,
): HTMLElement {
  if (c.view.kind === 'profile' && !c.remove)
    return document.createElement('div');
  const {
    host,
    panel: menu,
    trigger,
  } = anchoredMessageMenu({ signal: c.signal });
  if (c.view.kind === 'profile') {
    appendRemove(menu, c);
    return host;
  }
  if (c.replyAllowed !== false)
    menu.append(
      withMenuIcon(
        c.action(t('Reply'), () => {
          c.choose('reply', c.view);
          return Promise.resolve();
        }),
        'reply',
      ),
    );
  if (!c.view.archived && c.view.own && c.view.kind === 'text')
    menu.append(
      withMenuIcon(
        c.action(t('Edit'), () => {
          c.choose('edit', c.view);
          return Promise.resolve();
        }),
        'edit',
      ),
    );
  const reaction = c.action(t('React…'), async () => {
    const emoji = await c.picker.choose(trigger);
    if (emoji !== null && !c.signal.aborted) await c.react(c.view, emoji);
  });
  if (!c.view.archived) menu.append(withMenuIcon(reaction, 'react'));
  appendForward(menu, c);
  appendRemove(menu, c);
  return host;
}

function appendForward<T extends DailyRow>(
  menu: HTMLElement,
  c: MessageActionOptions<T>,
): void {
  if (c.peers.length && ['text', 'attachment'].includes(c.view.kind))
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
      withMenuIcon(c.action(t('Delete for both'), c.remove), 'trash'),
    );
}
