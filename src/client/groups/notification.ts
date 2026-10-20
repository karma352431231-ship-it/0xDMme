import { GroupController } from './controller.ts';
import type { AccountSession } from '../../shared/account/index.ts';
import type { VaultAccess } from '../vault-authority/index.ts';
import type { VaultSync } from '../vault-sync/index.ts';
import { conversationPreview } from '../conversation-preview/index.ts';
import { decodeDailyText } from '../../shared/daily/index.ts';

/** The normal group verifier with a permanently invisible window: receipt is
 * durable, but notification display can never acknowledge a message as read. */
export async function readGroupNotification(input: {
  session: AccountSession;
  access: VaultAccess;
  sync: VaultSync;
  signal: AbortSignal;
  group: string;
  id: string;
}) {
  const groups = new GroupController(input.access, input.sync, () => false);
  const close = () => groups.setSession(null);
  input.signal.addEventListener('abort', close, { once: true });
  groups.setSession(input.session);
  try {
    await groups.open(input.group);
    input.signal.throwIfAborted();
    const view = groups.views.find(
      (row) =>
        row.id === input.id &&
        !row.own &&
        !row.relation &&
        row.kind !== 'profile',
    );
    if (!view || !groups.selected) return null;
    const displayText =
      view.kind === 'text' ? decodeDailyText(view.text).text : '';
    return {
      title: groups.selected.title,
      sender: view.sender,
      text: conversationPreview({ ...view, displayText }).text,
    };
  } finally {
    input.signal.removeEventListener('abort', close);
    close();
  }
}
