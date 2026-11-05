import { publicUpvoteScore } from './upvoters.ts';
import { t } from '../../shared/i18n/index.ts';
import { participationLink } from '../profile-shortcut/index.ts';
import { postBookmark } from './post-bookmark.ts';
import { keys, object } from '../../shared/account/index.ts';
import { publicBlockState } from '../../shared/profile-social/index.ts';
import type {
  CommunityPost,
  PostState,
} from '../../shared/community-posts/index.ts';
import type { Communities } from './controller.ts';
import {
  communityButton as button,
  communityElement as el,
} from './elements.ts';
import { communityIcon, iconLabel } from './presentation.ts';
import { togglePostPreference, togglePostUpvote } from './post-interactions.ts';
import { postReportForm } from './post-forms.ts';
import { postLinkControl } from './post-link.ts';

interface Actions {
  saved?: boolean | undefined;
  controller: Pick<Communities, 'request'>;
  run: (work: () => Promise<void>) => Promise<void>;
  valid: () => boolean;
  changed: (state?: PostState) => Promise<void>;
  options?: (container: HTMLElement) => Promise<PostState | void>;
}
/**
 * Bookmark in the action row; the "..." menu at the end of the author row,
 * beside the handle (owner request, 01/11/2026). A card without an author
 * row keeps the menu in its action row.
 */
export function preferenceControls(
  card: { node: HTMLElement; toolbar: HTMLElement },
  post: CommunityPost,
  actions: Actions,
): void {
  postBookmark(card.toolbar, post, actions);
  const menu = el('details', '', 'post-more'),
    summary = el('summary'),
    content = el('div', '', 'post-more-content');
  summary.setAttribute('aria-label', t('More post options'));
  iconLabel(summary, 'more');
  menu.append(summary, content);
  (
    card.node.querySelector<HTMLElement>(':scope > .community-post-header') ??
    card.toolbar
  ).append(menu);
  if (post.status === 'visible') postLinkControl(content, post);
  const hide = button(content, t('Hide or show in my feeds'), () =>
    actions.run(async () => {
      const value = await togglePostPreference(post, 'hidden', actions);
      if (value) await actions.changed();
    }),
  );
  iconLabel(hide, 'hide');
  if (post.status === 'visible') reportControl(content, post, actions);
  if (post.author) {
    const block = button(content, t('Block user'), () =>
      actions.run(async () => {
        const target = post.author!.id;
        const current = publicBlockState(
          await actions.controller.request('profile-block-state', { target }),
        );
        if (!actions.valid()) return;
        publicBlockState(
          await actions.controller.request('profile-block-set', {
            target,
            blocked: true,
            revision: current.revision,
          }),
        );
        if (!actions.valid()) return;
        window.dispatchEvent(
          new CustomEvent('0xdmme-public-block', {
            detail: { target, blocked: true },
          }),
        );
        await actions.changed();
      }),
    );
    block.dataset['postBlock'] = 'true';
    block.classList.add('post-menu-danger');
    iconLabel(block, 'block');
  }
  if (actions.options) {
    const management = el('div', '', 'post-options');
    content.append(management);
    let loaded = false;
    summary.addEventListener('click', () => {
      if (loaded || menu.open) return;
      void actions.run(async () => {
        const state = await actions.options?.(management);
        if (state?.own) {
          content
            .querySelector<HTMLElement>('[data-post-block]')
            ?.setAttribute('hidden', '');
          content
            .querySelector<HTMLElement>('.post-report')
            ?.setAttribute('hidden', '');
        }
        if (actions.valid()) loaded = true;
      });
    });
  }
}
function reportControl(
  container: HTMLElement,
  post: CommunityPost,
  actions: Actions,
): void {
  const form = el('details', '', 'post-report'),
    summary = el('summary', t('Report'));
  iconLabel(summary, 'flag');
  form.append(summary);
  container.append(form);
  const status = el('p');
  status.setAttribute('role', 'status');
  form.append(status);
  postReportForm(form, post, (data) =>
    actions.run(async () => {
      if (!actions.valid()) return;
      const result = object(
        await actions.controller.request('public-report', data),
      );
      keys(result, ['saved']);
      if (result['saved'] !== true) throw new Error('Report not confirmed.');
      if (actions.valid())
        status.textContent = t("Report saved on the app's backend.");
    }),
  );
}
export function postVoting(
  container: HTMLElement,
  post: CommunityPost,
  actions: (Actions & { position?: -1 | 0 | 1 | undefined }) | null,
): void {
  if (post.status !== 'visible') return;
  const controls = el('div', '', 'post-votes');
  controls.setAttribute('aria-label', t('Post votes'));
  container.append(controls);
  // Upvote only (owner request, 01/11/2026); the server refuses downvotes.
  const node = actions
    ? button(controls, '', () =>
        actions.run(async () => {
          const state = await togglePostUpvote(post, actions);
          if (state && actions.valid()) await actions.changed(state);
        }),
      )
    : el('a');
  if (node instanceof HTMLAnchorElement)
    participationLink(node, t('Create a public profile to vote'));
  else
    node.setAttribute('aria-label', t('Upvote; tap again to remove your vote'));
  node.dataset['vote'] = '1';
  node.setAttribute('aria-pressed', String(actions?.position === 1));
  node.append(communityIcon('up'));
  if (!actions) controls.append(node);
  controls.append(publicUpvoteScore(post));
}
/** Compact menu for order/period choices; same values and validation as before. */
export function discoveryMenu(
  container: HTMLElement,
  label: string,
  selection: { value: string; options: readonly (readonly [string, string])[] },
  changed: (value: string) => void,
): HTMLDetailsElement {
  const menu = el('details', '', 'discovery-menu'),
    summary = el('summary'),
    value = el('span', '', 'discovery-menu-value'),
    options = el('div', '', 'discovery-menu-options');
  const control = el('div', '', 'discovery-control');
  const native = el('select', '', 'discovery-native');
  native.setAttribute('aria-label', label);
  options.setAttribute('role', 'group');
  options.setAttribute('aria-label', label);
  summary.append(value);
  menu.append(summary, options);
  let current = selection.value;
  const show = () => {
    const title =
      selection.options.find(([key]) => key === current)?.[1] ?? current;
    value.textContent = title;
    native.value = current;
    summary.setAttribute('aria-label', t('{0}: {1}', [label, title]));
    options.querySelectorAll('button').forEach((node) => {
      node.setAttribute('aria-pressed', String(node.value === current));
    });
  };
  const choose = (key: string) => {
    menu.open = false;
    if (key === current) return;
    current = key;
    show();
    changed(key);
  };
  native.addEventListener('change', () => choose(native.value));
  for (const [key, title] of selection.options) {
    const nativeOption = el('option', title);
    nativeOption.value = key;
    native.append(nativeOption);
    const option = el('button', title);
    option.type = 'button';
    option.value = key;
    option.addEventListener('click', () => choose(key));
    options.append(option);
  }
  show();
  control.append(menu, native);
  container.append(control);
  return menu;
}
export const feedOrders = [
  ['mixed', t('Highlights')],
  ['recent', t('Recent')],
  ['votes', t('Top voted')],
  ['replies', t('Most discussed')],
] as const;
export const discoveryPeriods = [
  ['day', t('24 hours')],
  ['week', t('7 days')],
  ['month', t('30 days')],
  ['all', t('All history')],
] as const;
