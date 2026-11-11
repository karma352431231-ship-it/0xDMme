import { messageReactions } from '../message-presentation/index.ts';
import { placeVideoMessageMeta } from '../chat-video/index.ts';
import type { EmojiPicker } from '../emoji/index.ts';
import { t } from '../../shared/i18n/index.ts';
import { anchoredMessageMenu } from '../message-menu/index.ts';
import { withMenuIcon } from '../menu-icons/index.ts';
/** Actions available to public-identity DMs, without borrowing private-message consent or wallet. */
export function dmMessageMenu(
  row: HTMLElement,
  input: {
    viewOnce?: boolean;
    text: string;
    signal: AbortSignal;
    picker: EmojiPicker;
    react?: (emoji: string) => Promise<void>;
    edit?: () => void;
    reply?: () => void;
    editable?: boolean;
    remove?: () => void;
    run: (work: () => Promise<void>) => Promise<void>;
  },
): () => void {
  const menu = anchoredMessageMenu({
    signal: input.signal,
    row,
    ...(input.reply ? { reply: input.reply } : {}),
  });
  const copy = document.createElement('button'),
    status = document.createElement('p');
  copy.type = 'button';
  copy.textContent = t('Copy text');
  status.setAttribute('role', 'status');
  copy.addEventListener('click', () => {
    void navigator.clipboard.writeText(input.text).catch(() => {
      if (!input.signal.aborted)
        status.textContent = t('Could not copy the text.');
    });
  });
  if (!input.viewOnce) menu.panel.append(withMenuIcon(copy, 'copy'));
  if (input.reply) {
    const reply = document.createElement('button');
    reply.type = 'button';
    reply.textContent = t('Reply');
    reply.addEventListener('click', () => input.reply?.());
    menu.panel.append(withMenuIcon(reply, 'reply'));
  }
  if (input.edit && input.editable && !input.viewOnce) {
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.textContent = t('Edit');
    edit.addEventListener('click', () => {
      input.edit?.();
    });
    menu.panel.append(withMenuIcon(edit, 'edit'));
  }
  if (input.remove) {
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = t('Delete for both');
    remove.addEventListener('click', () => input.remove?.());
    menu.panel.append(withMenuIcon(remove, 'trash'));
  }
  if (input.react) {
    const reaction = document.createElement('button');
    reaction.type = 'button';
    reaction.textContent = t('React…');
    reaction.addEventListener('click', () => {
      void input.run(async () => {
        const emoji = await input.picker.choose(menu.trigger);
        if (emoji !== null && !input.signal.aborted) await input.react?.(emoji);
      });
    });
    menu.panel.append(withMenuIcon(reaction, 'react'));
  }
  row.append(menu.host, status);
  return menu.stop;
}

export function dmReactionChips(
  row: HTMLElement,
  input: {
    reactions: readonly string[];
    ownReaction: string;
    react?: () => Promise<void>;
    run: (work: () => Promise<void>) => Promise<void>;
  },
): void {
  const meta = row.querySelector<HTMLElement>('.message-meta');
  if (meta) placeVideoMessageMeta(row, meta);
  if (!input.reactions.length) return;
  row.append(
    messageReactions({
      reactions: input.reactions,
      ownReaction: input.ownReaction,
      action: (label, work) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = label;
        button.addEventListener('click', () => {
          void input.run(work);
        });
        return button;
      },
      remove: input.react ?? null,
    }),
  );
}
