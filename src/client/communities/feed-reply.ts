import type { CommunityPost } from '../../shared/community-posts/index.ts';
import { postState } from '../../shared/community-posts/index.ts';
import type { ReplyActions } from './post-reply.ts';
import { postReply } from './post-reply.ts';
import { communityElement as el } from './elements.ts';

type FeedReplyAccess = Omit<ReplyActions, 'replied'>;

export function hasOpenFeedReply(container: HTMLElement | null): boolean {
  return Boolean(container?.querySelector('dialog.reply-box[open]'));
}

/** Reply in place; the distinct discussion link still navigates to the thread. */
export function feedReply(
  toolbar: HTMLElement,
  parent: CommunityPost,
  access: FeedReplyAccess | null,
): () => void {
  const status = el('p', '', 'community-feedback feed-reply-status');
  status.setAttribute('role', 'status');
  let stop: () => void = () => undefined;
  if (access) {
    stop = postReply(toolbar, parent, {
      ...access,
      replied: async (state) => {
        status.replaceChildren(el('span', 'Resposta publicada. '));
        const result = el('a', 'Ver resposta');
        result.href = `#comunidades?id=${parent.community}&post=${state.post.id}`;
        status.append(result);
        try {
          const current = postState(
            await access.controller.request('post-state', {
              id: parent.community,
              post: parent.id,
            }),
          );
          if (!access.valid()) return;
          const count = toolbar.querySelector('.post-comments > span');
          if (count) count.textContent = String(current.post.replies);
        } catch {
          if (access.valid())
            status.append(
              el('span', ' Não foi possível atualizar a contagem.'),
            );
        }
      },
    });
  } else {
    const login = el('a', 'Responder', 'post-action post-comments');
    login.href = '#perfil';
    login.setAttribute('aria-label', 'Entre pelo Perfil para responder');
    toolbar.append(login);
  }
  const discussion = el('a', 'Abrir discussão', 'post-action post-discussion');
  discussion.href = `#comunidades?id=${parent.community}&post=${parent.id}`;
  toolbar.append(discussion);
  toolbar.after(status);
  return () => {
    stop();
    status.remove();
  };
}
