import { t } from '../../shared/i18n/index.ts';
import { appendOwnProfileShortcut } from '../profile-shortcut/index.ts';
import { communityElement as el } from './elements.ts';

/**
 * Composer bar at the top of a community's posts (31/10/2026): the reader's
 * public photo, then a field-like button that opens the post composer. It
 * stays above the posts whether or not the community has any.
 *
 * While any part of the bar is on screen it carries `data-on-screen`, and the
 * floating "+" steps aside (community-actions.css, through `:has()`); the
 * mark leaves with the bar, so no other element keeps that state.
 */
export function communityComposerBar(options: {
  community: string;
  open: () => void;
  signal: AbortSignal;
}): { element: HTMLElement; setFirst: (first: boolean) => void } {
  const bar = el('div', '', 'community-composer-bar');
  // The photo is the shared own-profile shortcut, painted by the public
  // profile module; it opens the reader's profile like everywhere else.
  appendOwnProfileShortcut(bar);
  const field = el('button', '', 'community-composer-field');
  field.type = 'button';
  field.addEventListener('click', options.open);
  bar.append(field);
  const setFirst = (first: boolean) => {
    field.textContent = t(
      first ? 'community.composer.first {0}' : 'community.composer.prompt {0}',
      [options.community],
    );
  };
  setFirst(false);
  // Without the observer the "+" simply stays, as before this bar.
  if (typeof IntersectionObserver === 'undefined')
    return { element: bar, setFirst };
  const watch = new IntersectionObserver(([entry]) =>
    bar.toggleAttribute('data-on-screen', entry?.isIntersecting ?? false),
  );
  watch.observe(bar);
  options.signal.addEventListener('abort', () => watch.disconnect(), {
    once: true,
  });
  return { element: bar, setFirst };
}
