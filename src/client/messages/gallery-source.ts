import { Messages } from './controller.ts';
import { dailyViews } from '../daily-text/index.ts';
import { oldestRoot, historyPage } from '../history-window/index.ts';
import type { MessageView } from './message-view.ts';
import type { AccountSession } from '../../shared/account/index.ts';
import type { VaultAccess } from '../vault-authority/index.ts';
import type { VaultSync } from '../vault-sync/index.ts';
import type { GallerySource } from '../media-gallery/index.ts';
import { MessageContinuation } from './continuation.ts';
import { networkAvailable } from '../connectivity/index.ts';

function continuation(rows: readonly MessageView[]): number | null {
  const oldest = oldestRoot(rows);
  if (oldest === null || oldest <= 1) return null;
  return rows.filter((row) => !row.relation && row.kind !== 'profile').length <
    historyPage
    ? null
    : oldest;
}

/** A separate verified reader prepares catalogue pages without moving the chat
 * window or acknowledging a user's reading. */
export function privateGallerySource(input: {
  access: VaultAccess;
  sync: VaultSync;
  session: AccountSession;
  peer: string;
  localOnly: boolean;
}): GallerySource<MessageView> {
  let rows: readonly MessageView[] = [];
  const reader = new Messages(input.access, input.sync, (next) => {
    rows = next ?? [];
  });
  reader.setSession(input.session);
  reader.select(input.peer);
  let prepared = false;
  return {
    page: async (before, signal) => {
      signal.throwIfAborted();
      if (!prepared && !input.localOnly && networkAvailable()) {
        await reader.loadPins();
        prepared = true;
      }
      reader.focusMessage(before === null ? null : before - 1);
      if (input.localOnly) await reader.openArchive(input.peer);
      else if (!networkAvailable()) await reader.openOffline(input.peer);
      else {
        let next = await reader.synchronize();
        while (next instanceof MessageContinuation) {
          signal.throwIfAborted();
          next = await next.resume();
        }
      }
      signal.throwIfAborted();
      return {
        views: dailyViews(rows),
        next: continuation(rows),
      };
    },
    media: (view, thumbnail, signal) =>
      reader.galleryMedia(view, thumbnail, signal),
    close: () => reader.setSession(null),
  };
}
