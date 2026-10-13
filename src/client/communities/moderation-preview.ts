import { restrictedMedia } from '../community-media/index.ts';
import type { PublicModerationDetails } from '../../shared/moderation-details/index.ts';
import type { Communities } from './controller.ts';
/** Existing signed byte access stays restricted to the author and current retention window. */
export function previewModeratedMedia(
  controller: Communities,
  input: {
    host: HTMLElement;
    detail: PublicModerationDetails;
    signal: AbortSignal;
  },
): void {
  const post = input.detail.post;
  if (!post || input.detail.notice.kind !== 'post-media') return;
  restrictedMedia(input.host, [input.detail.notice.target], {
    community: post.community,
    signal: input.signal,
    valid: () => !input.signal.aborted,
    request: (operation, payload) => controller.request(operation, payload),
  });
}
