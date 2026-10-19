import { t, translatedError } from '../../shared/i18n/index.ts';
import type { CommunityPost } from '../../shared/community-posts/index.ts';
import type { ReplyActions } from './post-reply.ts';
import {
  communityButton as button,
  communityElement as el,
} from './elements.ts';
import { communityIcon } from './presentation.ts';
import { replyForm } from './post-forms.ts';
import { submitPostReply } from './post-interactions.ts';
import { hasPostDraft } from './composer-draft.ts';

/** Inside the discussion, expand the draft under its immediate parent. */
export function inlinePostReply(
  toolbar: HTMLElement,
  parent: CommunityPost,
  access: ReplyActions | null,
): () => void {
  const toggle = el('button', '', 'post-action post-comments');
  toggle.type = 'button';
  toggle.append(
    communityIcon('comment'),
    el('span', String(parent.replies)),
    el('span', t('Reply'), 'post-action-caption'),
  );
  toggle.setAttribute('aria-label', t('Reply to post'));
  toggle.setAttribute('aria-expanded', 'false');
  toolbar.append(toggle);
  if (!access || parent.status !== 'visible') {
    toggle.disabled = true;
    toggle.title = t('Replies unavailable for your membership.');
    return () => undefined;
  }
  const lifetime = new AbortController();
  let box: HTMLElement | null = null;
  const show = () => {
    if (!box || !access.valid() || lifetime.signal.aborted) return;
    box.hidden = !box.hidden;
    toggle.setAttribute('aria-expanded', String(!box.hidden));
    if (!box.hidden) box.querySelector<HTMLElement>('textarea')?.focus();
  };
  const close = () => {
    lifetime.abort();
    box?.remove();
    box = null;
    toggle.setAttribute('aria-expanded', 'false');
    toggle.removeAttribute('aria-controls');
  };
  access.media.signal.addEventListener('abort', close, {
    once: true,
    signal: lifetime.signal,
  });
  window.addEventListener(
    'beforeunload',
    (event) => {
      if (!box || !hasPostDraft(box)) return;
      event.preventDefault();
      event.returnValue = '';
    },
    { signal: lifetime.signal },
  );
  toggle.addEventListener('click', () => {
    if (box) {
      show();
      return;
    }
    void access.run(async () => {
      if (!(await access.canReply()))
        throw new Error('Replies unavailable for your membership.');
      if (!access.valid() || lifetime.signal.aborted) return;
      box = inlineReplyBox(
        toolbar,
        parent,
        {
          ...access,
          media: {
            ...access.media,
            signal: AbortSignal.any([lifetime.signal, access.media.signal]),
          },
          replied: async (state) => {
            box?.remove();
            box = null;
            toggle.setAttribute('aria-expanded', 'false');
            toggle.removeAttribute('aria-controls');
            await access.replied(state);
          },
        },
        show,
      );
      show();
    });
  });
  return close;
}

function inlineReplyBox(
  toolbar: HTMLElement,
  parent: CommunityPost,
  access: ReplyActions,
  hide: () => void,
): HTMLElement {
  const box = el('section', '', 'reply-box reply-inline');
  box.id = 'reply-' + crypto.randomUUID();
  box.setAttribute('aria-label', t('Write a reply'));
  box.hidden = true;
  toolbar
    .querySelector('.post-comments')
    ?.setAttribute('aria-controls', box.id);
  toolbar.after(box);
  const content = replyForm(
      box,
      { title: '', text: '', tags: [] },
      access.media,
    ),
    actions = el('div', '', 'reply-box-actions'),
    feedback = el('p', '', 'community-feedback');
  feedback.setAttribute('role', 'status');
  box.append(actions, feedback);
  const id = crypto.randomUUID();
  button(actions, t('Cancel'), () => {
    hide();
    return Promise.resolve();
  });
  button(actions, t('Publish reply'), () =>
    access.run(async () => {
      feedback.textContent = '';
      try {
        if (!(await access.canReply()))
          throw new Error('Replies unavailable for your membership.');
        const state = await submitPostReply(parent, { id, content }, access);
        if (state) await access.replied(state);
      } catch (error: unknown) {
        feedback.textContent =
          error instanceof Error
            ? translatedError(error.message)
            : t('Reply unavailable.');
        throw error;
      }
    }),
  ).classList.add('primary');
  return box;
}
