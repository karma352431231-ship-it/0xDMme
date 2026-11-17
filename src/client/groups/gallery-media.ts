import { attachmentContent } from '../../shared/attachments/index.ts';
import { groupQuota } from '../../shared/group-quota/index.ts';
import { downloadAttachment } from '../attachments/index.ts';
import { historyWait, timedLoad } from '../chat-sync-diagnostics/index.ts';
import type { LoadTrace } from '../chat-sync-diagnostics/index.ts';
import { messageApi } from '../message-api/index.ts';
import { withSigner } from '../vault-authority/index.ts';
import type { VaultAccess } from '../vault-authority/index.ts';
import { groupCacheScope } from './cache.ts';
import { groupAttachmentApi } from './media.ts';
import type { GroupState } from './governance.ts';
import type { GroupView } from './reader.ts';

/** The completed group read supplies the verified membership head. Every
 * attachment request and both availability checks enforce that same head. */
export async function readGroupGalleryMedia(input: {
  access: VaultAccess;
  group: GroupState;
  view: GroupView;
  thumbnail: boolean;
  signal: AbortSignal;
  guard: () => void;
  diagnostic: LoadTrace | undefined;
}): Promise<Uint8Array<ArrayBuffer>> {
  const { access, group, view, thumbnail, signal, guard, diagnostic } = input;
  const admitted = historyWait(diagnostic, 'vault');
  const scope = { groupId: group.state.groupId, head: group.head };
  const confirm = () =>
    withSigner(access, async (authority) => {
      admitted();
      const available = await messageApi(
        authority,
        'group-message-available',
        {
          ...scope,
          id: view.id,
          hash: view.hash,
        },
        { guard, signal },
      );
      if (available !== true)
        throw new Error(
          'The message was deleted or is unavailable for opening media.',
        );
      return authority.session.accountId;
    });
  const content = attachmentContent(JSON.parse(view.text) as unknown);
  const file = thumbnail ? content.thumbnail : content.file;
  if (!file) throw new Error('Preview unavailable.');
  const account = await timedLoad(diagnostic, 'permissions', confirm);
  const bytes = await downloadAttachment({
    account: groupCacheScope(account, scope.groupId),
    message: view.id,
    file,
    thumbnail,
    image: thumbnail || content.image,
    api: groupAttachmentApi(group, (operation, data) =>
      withSigner(access, (authority) =>
        messageApi(authority, operation, data, { guard, signal }),
      ),
    ),
    snapshot: null,
    guard,
    diagnostic,
    signal,
    budget: groupQuota,
    transient: true,
  });
  try {
    await timedLoad(diagnostic, 'confirm', confirm);
    guard();
    return bytes;
  } catch (error: unknown) {
    bytes.fill(0);
    throw error;
  }
}
