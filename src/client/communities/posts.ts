import type { Communities } from './controller.ts';
import type { ExternalMediaConsent } from '../external-media/index.ts';
import { startCommunityPostList } from './post-list.ts';
import { TagManagement } from './tag-management.ts';

/** Switches the public post list and isolated tag editor, ending the old owner first. */
export function startCommunityPosts(
  controller: Communities,
  privacy: ExternalMediaConsent,
  openComposer: (id: string) => void,
) {
  const posts = startCommunityPostList(controller, privacy, openComposer);
  const tags = new TagManagement(controller);
  function leave(): void {
    posts.leave();
    tags.dispose();
  }
  return {
    mount(...args: Parameters<typeof posts.mount>): void {
      tags.dispose();
      posts.mount(...args);
    },
    manageTags(container: HTMLElement, community: string): void {
      leave();
      tags.mount(container, community);
    },
    leave,
    refresh: posts.refresh,
    invalidatePrivate: posts.invalidatePrivate,
    canActivate: () => posts.canActivate() && tags.canActivate(),
  };
}
