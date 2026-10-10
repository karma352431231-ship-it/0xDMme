import type {
  CommunityPost,
  PostState,
} from '../../shared/community-posts/index.ts';
import type { CommunityMediaAccess } from '../community-media/index.ts';
import type { Communities } from './controller.ts';
import {
  communityButton as button,
  communityElement as el,
} from './elements.ts';
import { communityIcon } from './presentation.ts';
import { replyForm } from './post-forms.ts';
import { submitPostReply } from './post-interactions.ts';

export interface ReplyActions {
  controller: Pick<Communities, 'request'>;
  run: (work: () => Promise<void>) => Promise<void>;
  valid: () => boolean;
  canReply: () => Promise<boolean>;
  media: CommunityMediaAccess;
  replied: (state: PostState) => Promise<void>;
}
/** The same inline composer belongs to the actual parent, on any public view. */
export function postReply(
  toolbar: HTMLElement,
  parent: CommunityPost,
  access: ReplyActions | null,
): void {
  const toggle = el('button', '', 'post-action post-comments');
  toggle.type = 'button';
  toggle.append(
    communityIcon('comment'),
    el('span', String(parent.replies)),
    el('span', 'Responder', 'post-action-caption'),
  );
  toggle.setAttribute('aria-label', 'Responder à postagem');
  toolbar.append(toggle);
  if (!access || parent.status !== 'visible') {
    toggle.disabled = true;
    toggle.title = 'Respostas indisponíveis para sua participação.';
    return;
  }
  toggle.setAttribute('aria-expanded', 'false');
  let box: HTMLElement | null = null;
  const show = () => {
    if (!box || !access.valid()) return;
    box.hidden = !box.hidden;
    toggle.setAttribute('aria-expanded', String(!box.hidden));
    if (!box.hidden) box.querySelector<HTMLElement>('textarea, input')?.focus();
  };
  toggle.addEventListener('click', () => {
    if (box) {
      show();
      return;
    }
    void access.run(async () => {
      if (!(await access.canReply()))
        throw new Error('Respostas indisponíveis para sua participação.');
      if (!access.valid()) return;
      box = replyBox(toolbar, parent, access, {
        close: show,
        published: () => {
          box?.remove();
          box = null;
          toggle.setAttribute('aria-expanded', 'false');
        },
      });
      show();
    });
  });
}
function replyBox(
  toolbar: HTMLElement,
  parent: CommunityPost,
  access: ReplyActions,
  callbacks: { close: () => void; published: () => void },
): HTMLElement {
  const box = el('div', '', 'reply-box');
  box.hidden = true;
  toolbar.after(box);
  const content = replyForm(
      box,
      { title: '', text: '', tag: null },
      access.media,
    ),
    actions = el('div', '', 'reply-box-actions');
  box.append(actions);
  let id = crypto.randomUUID();
  button(actions, 'Cancelar', () => {
    callbacks.close();
    return Promise.resolve();
  });
  button(actions, 'Responder', () =>
    access.run(async () => {
      if (!(await access.canReply()))
        throw new Error('Respostas indisponíveis para sua participação.');
      const state = await submitPostReply(parent, { id, content }, access);
      if (!state) return;
      id = crypto.randomUUID();
      callbacks.published();
      await access.replied(state);
    }),
  ).classList.add('primary');
  return box;
}
