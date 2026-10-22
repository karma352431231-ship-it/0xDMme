import type { MessageSyncSnapshot } from '../../shared/message-sync/index.ts';
import { messagePageSize } from '../../shared/messages/index.ts';
import { messageItems } from './history.ts';
import type { Api, MessageItem } from './history.ts';
import { assertMessagePage, messagePeer } from './index-sync.ts';

/** The server returns the window a complete scan would collect for this peer:
 * up to 16 live roots and each participant's latest profile packet, all inside
 * the confirmed cut. Every row is checked again here before it is published;
 * relations, packet opening, delivery and final confirmation stay with the
 * caller, exactly as for a window taken from the complete index. */
export async function readPeerWindow(c: {
  api: Api;
  snapshot: MessageSyncSnapshot;
  account: string;
  peer: string;
  before: number | null;
  deleted: (item: MessageItem) => Promise<void>;
}): Promise<MessageItem[]> {
  const page = messageItems(
    await c.api('sync-peer-window', {
      snapshot: c.snapshot,
      peer: c.peer,
      before: c.before,
    }),
    messagePageSize + 2,
  );
  if (page.next !== null) throw new Error('Message window does not match.');
  assertMessagePage(page, 0);
  const profiles = new Map<string, MessageItem>(),
    roots: MessageItem[] = [];
  for (const item of page.items) {
    assertWindowItem(c, item);
    if (item.kind !== 'profile') roots.push(item);
    else if (profiles.has(item.sender))
      throw new Error('Message window does not match.');
    else profiles.set(item.sender, item);
  }
  if (roots.length > messagePageSize)
    throw new Error('Message window does not match.');
  for (const profile of profiles.values())
    if (profile.deleted) await c.deleted(profile);
  return [...[...profiles.values()].filter((item) => !item.deleted), ...roots];
}

function assertWindowItem(
  c: {
    snapshot: MessageSyncSnapshot;
    account: string;
    peer: string;
    before: number | null;
  },
  item: MessageItem,
): void {
  if (
    messagePeer(c.account, item) !== c.peer ||
    item.sequence > c.snapshot.anchor
  )
    throw new Error('Message outside the requested window.');
  if (item.kind === 'profile') return;
  if (
    item.relation ||
    item.deleted ||
    (c.before !== null && item.sequence >= c.before)
  )
    throw new Error('Message window does not match.');
}
