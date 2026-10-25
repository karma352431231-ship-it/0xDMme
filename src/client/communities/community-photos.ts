import type { Community } from '../../shared/communities/index.ts';
import { showPublicAvatar } from '../public-media/index.ts';

/** Each presentation owner retains and releases only its own public images. */
export class CommunityPhotos {
  private readonly retained = new Map<() => void, HTMLElement>();
  clear(container?: HTMLElement | null): void {
    for (const [cleanup, node] of this.retained) {
      if (container && !container.contains(node)) continue;
      cleanup();
      this.retained.delete(cleanup);
    }
  }
  show(
    container: HTMLElement,
    input: Parameters<typeof showPublicAvatar>[1],
  ): void {
    this.retained.set(showPublicAvatar(container, input), container);
  }
  avatar(container: HTMLElement, value: Community, signal: AbortSignal): void {
    if (!value.avatar) return;
    this.show(container, {
      kind: 'community-photo',
      target: value.id,
      reference: value.avatar,
      signal,
    });
  }
}
