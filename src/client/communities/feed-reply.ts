import { t } from '../../shared/i18n/index.ts';
import type { CommunityPost } from '../../shared/community-posts/index.ts';
import { postState } from '../../shared/community-posts/index.ts';
import type { ReplyActions } from './post-reply.ts';
import { postReply } from './post-reply.ts';
import { communityElement as el } from './elements.ts';

type FeedReplyAccess = Omit<ReplyActions, 'replied'>;

export function hasOpenFeedReply(container: HTMLElement | null): boolean {
  return Boolean(container?.querySelector('dialog.reply-box[open]'));
}

/** Reply in place; a hidden target keeps card navigation separate from replying. */
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
        status.replaceChildren(el('span', t('Resposta publicada.') + ' '));
        const result = el('a', t('Ver resposta'));
        result.href = `#communities?id=${parent.community}&post=${state.post.id}`;
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
              el('span', ' ' + t('Não foi possível atualizar a contagem.')),
            );
        }
      },
    });
  } else {
    const login = el('a', t('Responder'), 'post-action post-comments');
    login.href = '#settings';
    login.setAttribute('aria-label', t('Entre pelo Perfil para responder'));
    toolbar.append(login);
  }
  const discussion = el('a', '', 'post-discussion');
  discussion.hidden = true;
  discussion.href = `#communities?id=${parent.community}&post=${parent.id}`;
  toolbar.append(discussion);
  toolbar.after(status);
  return () => {
    stop();
    status.remove();
  };
}
