import type { Peer } from '../../shared/contacts/index.ts';
import type { DailyRow, DailyView } from '../daily-text/index.ts';
import type { EmojiPicker } from '../emoji/index.ts';
import { chatIcon } from '../chat-ui/index.ts';
interface MessageActionOptions<T extends DailyRow> {
  view: DailyView<T>;
  peers: readonly Peer[];
  replyAllowed?: boolean;
  action: (label: string, work: () => Promise<void>) => HTMLButtonElement;
  choose: (mode: 'reply' | 'edit', view: T) => void;
  react: (view: T, reaction: string) => Promise<void>;
  picker: EmojiPicker;
  forward: (view: DailyView<T>, peer: string) => Promise<void>;
  remove?: () => Promise<void>;
}
export function messageActions<T extends DailyRow>(
  c: MessageActionOptions<T>,
): HTMLElement {
  const host = document.createElement('div');
  host.className = 'message-actions';
  if (c.view.kind === 'profile' && !c.remove) return host;
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'chat-icon';
  trigger.setAttribute('aria-label', 'Opções da mensagem');
  trigger.title = 'Opções da mensagem';
  trigger.setAttribute('aria-haspopup', 'dialog');
  trigger.innerHTML = chatIcon('more');
  const menu = document.createElement('dialog');
  menu.className = 'message-menu';
  menu.setAttribute('aria-label', 'Opções da mensagem');
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'message-menu-close';
  close.textContent = 'Fechar';
  close.addEventListener('click', () => menu.close());
  menu.append(close);
  trigger.addEventListener('click', () => menu.showModal());
  host.append(trigger, menu);
  menu.addEventListener(
    'click',
    (event) => {
      if (event.target instanceof Element && event.target.closest('button'))
        menu.close();
    },
    { capture: true },
  );
  if (c.view.kind === 'profile') {
    appendRemove(menu, c);
    return host;
  }
  if (c.replyAllowed !== false)
    menu.append(
      c.action('Responder', () => {
        c.choose('reply', c.view);
        return Promise.resolve();
      }),
    );
  if (!c.view.archived && c.view.own && c.view.kind === 'text')
    menu.append(
      c.action('Editar', () => {
        c.choose('edit', c.view);
        return Promise.resolve();
      }),
    );
  const reaction = c.action('Reagir…', async () => {
    const emoji = await c.picker.choose(trigger);
    if (emoji !== null) await c.react(c.view, emoji);
  });
  if (!c.view.archived)
    menu.append(
      reaction,
      c.action('Remover minha reação', () => c.react(c.view, '')),
    );
  appendForward(menu, c);
  appendRemove(menu, c);
  return host;
}

function appendForward<T extends DailyRow>(
  menu: HTMLElement,
  c: MessageActionOptions<T>,
): void {
  const target = document.createElement('select');
  target.setAttribute('aria-label', 'Contato para encaminhar');
  for (const peer of c.peers) {
    const option = document.createElement('option');
    option.value = peer.accountId;
    option.textContent = peer.name || peer.address;
    target.append(option);
  }
  if (c.peers.length)
    menu.append(
      target,
      c.action('Encaminhar', () => c.forward(c.view, target.value)),
    );
}

function appendRemove<T extends DailyRow>(
  menu: HTMLElement,
  c: MessageActionOptions<T>,
): void {
  if (c.remove) menu.append(c.action('Apagar para ambos', c.remove));
}
