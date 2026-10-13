import { t } from '../../shared/i18n/index.ts';
import type { CommunityPost } from '../../shared/community-posts/index.ts';
import { communityElement as el } from './elements.ts';
import { communityIcon } from './presentation.ts';
import { ReplyComposer } from './reply-composer.ts';
import type { ReplyActions } from './reply-composer.ts';
export type { ReplyActions } from './reply-composer.ts';

export function postReply(
  toolbar: HTMLElement,
  parent: CommunityPost,
  access: ReplyActions | null,
): () => void {
  const toggle = el('button', '', 'post-action post-comments');
  toggle.type = 'button';
  toggle.append(
    communityIcon('comment'),
    el('span', String(parent.replies)),
    el('span', t('Responder'), 'post-action-caption'),
  );
  toggle.setAttribute('aria-label', t('Responder à postagem'));
  toggle.setAttribute('aria-haspopup', 'dialog');
  toolbar.append(toggle);
  if (!access || parent.status !== 'visible') {
    toggle.disabled = true;
    toggle.title = t('Respostas indisponíveis para sua participação.');
    return () => undefined;
  }
  toggle.setAttribute('aria-expanded', 'false');
  let composer: ReplyComposer | null = null;
  let disposed = false;
  toggle.addEventListener('click', () => {
    if (composer?.active) return;
    void access.run(async () => {
      if (!(await access.canReply()))
        throw new Error('Respostas indisponíveis para sua participação.');
      if (disposed || !access.valid()) return;
      composer = new ReplyComposer(parent, access, toggle);
      composer.open(toolbar);
    });
  });
  return () => {
    disposed = true;
    composer?.close();
  };
}
