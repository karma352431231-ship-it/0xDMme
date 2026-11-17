import { attachmentContent } from '../../shared/attachments/index.ts';
import { groupQuota } from '../../shared/group-quota/index.ts';
import { localMediaPreview } from '../media-preview/index.ts';
import { galleryCheckpoint } from '../media-gallery/index.ts';
import { messageApi } from '../message-api/index.ts';
import { groupSnapshot } from './message-index.ts';
import type { Snapshot } from './message-index.ts';
import { networkAvailable } from '../connectivity/index.ts';
import { groupCacheScope } from './cache.ts';
import type { GroupSummary } from './directory-refresh.ts';
import { GroupController } from './controller.ts';
import { groupMessageView } from './message-content.ts';
import { oldestRoot, historyPage } from '../history-window/index.ts';
import { MessageContinuation } from '../synchronization-work/index.ts';
import type { GroupMessageView } from './message-content.ts';
import type { AccountSession } from '../../shared/account/index.ts';
import type { VaultAccess } from '../vault-authority/index.ts';
import type { VaultSync } from '../vault-sync/index.ts';
import type { GallerySource } from '../media-gallery/index.ts';

function galleryCut(cut: Snapshot | null): string | null {
  if (!cut || cut.anchor === undefined || cut.invalidation === undefined)
    return null;
  return JSON.stringify([
    cut.groupId,
    cut.head,
    cut.directory,
    cut.revision,
    cut.invalidation,
    cut.anchor,
  ]);
}

/** The normal group verifier owns this independent catalogue reader. */
export function groupGallerySource(input: {
  access: VaultAccess;
  sync: VaultSync;
  session: AccountSession;
  group: string;
  localOnly: boolean;
  initial?: GroupSummary;
}): GallerySource<GroupMessageView> {
  const reader = new GroupController(input.access, input.sync, () => false);
  reader.setSession(input.session);
  const group = input.initial;
  return {
    ...(!group || input.localOnly
      ? {}
      : {
          checkpoint: galleryCheckpoint<GroupMessageView>({
            access: input.access,
            session: input.session,
            key: `group:${input.group}`,
            current: async (authority, signal) => {
              const raw = await messageApi(
                authority,
                'group-message-snapshot',
                {
                  groupId: input.group,
                  head: group.head,
                },
                { guard: () => signal.throwIfAborted(), signal },
              );
              return galleryCut(groupSnapshot({ group, authority }, raw));
            },
          }),
        }),
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
        cut:
          !input.localOnly && networkAvailable()
            ? galleryCut(reader.galleryCut(input.group))
            : null,
        next:
          rows.length < historyPage || oldest === null || oldest <= 1
            ? null
            : oldest,
      };
    },
    media: (view, thumbnail, signal, diagnostic) =>
      reader.galleryMedia({
        view,
        thumbnail,
        signal,
        initial: input.initial,
        diagnostic,
      }),
    previews: (view, signal) =>
      localMediaPreview({
        access: input.access,
        session: input.session,
        signal,
        identity: {
          scope: groupCacheScope(input.session.accountId, view.groupId),
          message: view.id,
          file: attachmentContent(JSON.parse(view.text) as unknown).file,
          maximum: groupQuota,
          context: [view.groupId, view.epoch, view.hash],
        },
      }),
    close: () => reader.setSession(null),
  };
}
