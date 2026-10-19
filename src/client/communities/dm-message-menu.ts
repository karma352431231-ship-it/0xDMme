import { messageReactions } from '../message-presentation/index.ts';
import type { EmojiPicker } from '../emoji/index.ts';
import { t } from '../../shared/i18n/index.ts';
import { anchoredMessageMenu } from '../message-menu/index.ts';
import { withMenuIcon } from '../menu-icons/index.ts';
/** Actions available to public-identity DMs, without borrowing private-message consent or wallet. */
export function dmMessageMenu(
  row: HTMLElement,
  input: {
    text: string;
    signal: AbortSignal;
    picker: EmojiPicker;
    react?: (emoji: string) => Promise<void>;
    edit?: () => void;
    editable?: boolean;
    run: (work: () => Promise<void>) => Promise<void>;
  },
): () => void {
  const menu = anchoredMessageMenu({ signal: input.signal });
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
  menu.panel.append(withMenuIcon(copy, 'copy'));
  if (input.edit && input.editable) {
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.textContent = t('Edit');
    edit.addEventListener('click', () => {
      input.edit?.();
    });
    menu.panel.append(withMenuIcon(edit, 'edit'));
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
  const meta = row.querySelector('.message-meta');
  if (meta) row.append(meta);
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
