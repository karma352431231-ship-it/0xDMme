import type { Peer } from '../../shared/contacts/index.ts';
import type { DailyRow, DailyView } from '../daily-text/index.ts';
import type { EmojiPicker } from '../emoji/index.ts';
export function messageActions<T extends DailyRow>(c: {
  view: DailyView<T>;
  peers: readonly Peer[];
  replyAllowed?: boolean;
  action: (label: string, work: () => Promise<void>) => HTMLButtonElement;
  choose: (mode: 'reply' | 'edit', view: T) => void;
  react: (view: T, reaction: string) => Promise<void>;
  picker: EmojiPicker;
  forward: (view: DailyView<T>, peer: string) => Promise<void>;
}): HTMLElement {
  const host = document.createElement('div');
  host.className = 'message-actions';
  if (c.view.kind === 'profile') return host;
  if (c.replyAllowed !== false)
    host.append(
      c.action('Responder', () => {
        c.choose('reply', c.view);
        return Promise.resolve();
      }),
    );
  if (!c.view.archived && c.view.own && c.view.kind === 'text')
    host.append(
      c.action('Editar', () => {
        c.choose('edit', c.view);
        return Promise.resolve();
      }),
    );
  const reaction = c.action('Reagir…', async () => {
    const emoji = await c.picker.choose(reaction);
    if (emoji !== null) await c.react(c.view, emoji);
  });
  if (!c.view.archived)
    host.append(
      reaction,
      c.action('Remover minha reação', () => c.react(c.view, '')),
    );
  const target = document.createElement('select');
  target.setAttribute('aria-label', 'Contato para encaminhar');
  for (const peer of c.peers) {
    const option = document.createElement('option');
    option.value = peer.accountId;
    option.textContent = peer.name || peer.address;
    target.append(option);
  }
  host.append(
    target,
    c.action('Encaminhar', () => c.forward(c.view, target.value)),
  );
  return host;
}
