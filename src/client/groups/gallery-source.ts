import { GroupController } from './controller.ts';
import { groupMessageView } from './message-content.ts';
import { oldestRoot, historyPage } from '../history-window/index.ts';
import { MessageContinuation } from '../synchronization-work/index.ts';
import type { GroupMessageView } from './message-content.ts';
import type { AccountSession } from '../../shared/account/index.ts';
import type { VaultAccess } from '../vault-authority/index.ts';
import type { VaultSync } from '../vault-sync/index.ts';
import type { GallerySource } from '../media-gallery/index.ts';

/** The normal group verifier owns this independent catalogue reader. */
export function groupGallerySource(input: {
  access: VaultAccess;
  sync: VaultSync;
  session: AccountSession;
  group: string;
  localOnly: boolean;
}): GallerySource<GroupMessageView> {
  const reader = new GroupController(input.access, input.sync, () => false);
  reader.setSession(input.session);
  return {
    page: async (before, signal) => {
      signal.throwIfAborted();
      if (before === null) reader.latest();
      else reader.focusMessage(input.group, before - 1);
      let next = await reader.open(input.group, false, input.localOnly);
      while (next instanceof MessageContinuation) {
        signal.throwIfAborted();
        next = await next.resume();
      }
      signal.throwIfAborted();
      const rows = reader.views;
      const oldest = oldestRoot(rows);
      return {
        views: rows.map(groupMessageView),
        next:
          rows.length < historyPage || oldest === null || oldest <= 1
            ? null
            : oldest,
      };
    },
    media: (view, thumbnail, signal) => {
      signal.throwIfAborted();
      return reader.galleryMedia(view, thumbnail);
    },
    close: () => reader.setSession(null),
  };
}
