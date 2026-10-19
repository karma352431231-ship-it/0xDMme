import { t } from '../../shared/i18n/index.ts';
import type { ProfileFollow } from '../../shared/profile-social/index.ts';
import type { PublicProfile } from '../../shared/public-profile/index.ts';
import { showPublicAvatar } from '../public-media/index.ts';
import { communityAvatar } from './presentation.ts';
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
  community: { id: string; name: string; avatar?: string | null };
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
      status = el('p', t('Loading options…'), 'feed-follow-status'),
      cancel = el('button', t('Cancel')),
      lifetime = new AbortController();
    const signal = AbortSignal.any([options.signal, lifetime.signal]);
    cancel.className = 'feed-follow-cancel';
    dialog.setAttribute('aria-label', t('Follow community or author'));
    status.setAttribute('role', 'status');
    cancel.type = 'button';
    let settled = false;
    const dispose = () => {
      settled = true;
      lifetime.abort();
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
    dialog.append(status, cancel);
    document.body.append(dialog);
    try {
      dialog.showModal();
    } catch (error: unknown) {
      dispose();
      reject(
        error instanceof Error
          ? error
          : new Error('Follow options unavailable.'),
      );
      return;
    }
    void options
      .load()
      .then((state) => {
        if (settled) return;
        const community = choiceRow({
          name: options.community.name,
          photo: {
            kind: 'community-photo',
            target: options.community.id,
            reference: options.community.avatar ?? null,
          },
          following: state.community,
          signal,
          choose: () => finish({ target: 'community', state }),
        });
        status.textContent = '';
        dialog.insertBefore(community, status);
        // Your own post: there is no profile to follow, only the community.
        if (!options.author || state.author)
          dialog.insertBefore(
            authorChoice({
              author: options.author,
              state: state.author,
              signal,
              choose: () => finish({ target: 'author', state }),
            }),
            status,
          );
        community.querySelector('button')?.focus();
      })
      .catch((error: unknown) => {
        if (settled) return;
        dispose();
        reject(
          error instanceof Error
            ? error
            : new Error('Follow options unavailable.'),
        );
      });
  });
}
function authorChoice(input: {
  author: PublicProfile | null;
  state: ProfileFollow | null;
  signal: AbortSignal;
  choose: () => void;
}): HTMLElement {
  return choiceRow({
    name: input.author ? `@${input.author.handle}` : t('Author unavailable'),
    photo: {
      kind: 'avatar',
      target: input.author?.id ?? '',
      reference: input.author?.avatar ?? null,
    },
    following: input.state?.following ?? false,
    disabled: !input.author || !input.state,
    signal: input.signal,
    choose: input.choose,
  });
}
function choiceRow(input: {
  name: string;
  photo: {
    kind: 'community-photo' | 'avatar';
    target: string;
    reference?: string | null;
  };
  following: boolean;
  disabled?: boolean;
  signal: AbortSignal;
  choose: () => void;
}): HTMLElement {
  const row = el('div', '', 'feed-follow-choice'),
    avatar = communityAvatar(input.name),
    button = el(
      'button',
      input.following ? t('follow.following') : t('Follow'),
    );
  if (input.photo.kind === 'avatar') avatar.classList.add('person');
  button.type = 'button';
  button.disabled = input.disabled ?? false;
  button.setAttribute(
    'aria-label',
    t('{0} {1}', [input.following ? t('Unfollow') : t('Follow'), input.name]),
  );
  button.setAttribute('aria-pressed', String(input.following));
  button.addEventListener('click', input.choose);
  const identity = el('div', '', 'feed-follow-identity');
  identity.append(
    el('strong', input.name),
    el(
      'small',
      input.photo.kind === 'avatar' ? t('follow.user') : t('follow.community'),
    ),
  );
  row.append(avatar, identity, button);
  if (input.photo.reference)
    showPublicAvatar(avatar, {
      ...input.photo,
      reference: input.photo.reference,
      signal: input.signal,
    });
  return row;
}
