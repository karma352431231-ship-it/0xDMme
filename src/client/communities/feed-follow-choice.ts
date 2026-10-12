import type { ProfileFollow } from '../../shared/profile-social/index.ts';
import type { PublicProfile } from '../../shared/public-profile/index.ts';
import { communityElement as el } from './elements.ts';

export interface FeedFollowStates {
  community: boolean;
  author: ProfileFollow | null;
}
export type FeedFollowChoice = {
  target: 'community' | 'author';
  state: FeedFollowStates;
};
interface ChoiceOptions {
  community: string;
  author: PublicProfile | null;
  signal: AbortSignal;
  load: () => Promise<FeedFollowStates>;
}

/** Closing never selects a target. Pending reads cannot revive a closed dialog. */
export function chooseFeedFollow(
  options: ChoiceOptions,
): Promise<FeedFollowChoice | null> {
  if (options.signal.aborted) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const dialog = el('dialog', '', 'feed-follow-dialog'),
      title = el('h2', 'Quem seguir?'),
      status = el('p', 'Carregando opções…', 'feed-follow-status'),
      cancel = el('button', 'Cancelar');
    dialog.setAttribute('aria-label', 'Seguir comunidade ou autor');
    status.setAttribute('role', 'status');
    cancel.type = 'button';
    let settled = false;
    const dispose = () => {
      settled = true;
      options.signal.removeEventListener('abort', close);
      dialog.close();
      dialog.remove();
    };
    const finish = (choice: FeedFollowChoice | null) => {
      if (settled) return;
      dispose();
      resolve(choice);
    };
    const close = () => finish(null);
    cancel.addEventListener('click', close);
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      close();
    });
    dialog.addEventListener('click', (event) => {
      if (event.target !== dialog) return;
      const bounds = dialog.getBoundingClientRect();
      if (
        event.clientX < bounds.left ||
        event.clientX > bounds.right ||
        event.clientY < bounds.top ||
        event.clientY > bounds.bottom
      )
        close();
    });
    options.signal.addEventListener('abort', close, { once: true });
    dialog.append(title, status, cancel);
    document.body.append(dialog);
    try {
      dialog.showModal();
    } catch (error: unknown) {
      dispose();
      reject(
        error instanceof Error
          ? error
          : new Error('Opções de seguir indisponíveis.'),
      );
      return;
    }
    void options
      .load()
      .then((state) => {
        if (settled) return;
        const community = choiceButton(
          state.community ? 'Deixar de seguir comunidade' : 'Seguir comunidade',
          options.community,
          () => finish({ target: 'community', state }),
        );
        const author = choiceButton(
          authorLabel(options.author, state.author),
          options.author ? `@${options.author.handle}` : 'Autor indisponível',
          () => finish({ target: 'author', state }),
        );
        author.disabled = !options.author || !state.author;
        status.textContent = '';
        dialog.insertBefore(community, status);
        dialog.insertBefore(author, status);
        community.focus();
      })
      .catch((error: unknown) => {
        if (settled) return;
        dispose();
        reject(
          error instanceof Error
            ? error
            : new Error('Opções de seguir indisponíveis.'),
        );
      });
  });
}
function choiceButton(label: string, name: string, choose: () => void) {
  const node = el('button', '', 'feed-follow-choice');
  node.type = 'button';
  node.append(el('strong', label), el('span', name));
  node.addEventListener('click', choose);
  return node;
}
function authorLabel(
  author: PublicProfile | null,
  state: ProfileFollow | null,
) {
  if (!author) return 'Autor indisponível';
  if (!state) return 'Seu perfil';
  return state.following ? 'Deixar de seguir autor' : 'Seguir autor';
}
