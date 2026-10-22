import type { ConversationPreviewLoader } from '../conversation-preview/index.ts';
import type { ConversationPreview } from '../conversation-preview/index.ts';
import type { MessageItem } from './history.ts';
import { messagePeer } from './index-sync.ts';
import type { MessageView, ReceiptCommit } from './controller.ts';
import { publishVerifiedConversationPreview } from './verified-previews.ts';

interface ReceiptPreviewPorts {
  previews: ConversationPreviewLoader;
  /** Peers whose preview another verified window owns. */
  excluded: () => readonly string[];
  online: () => boolean;
  /** Whether a list read may start now; otherwise it waits for later. */
  lookupAllowed: () => boolean;
  lookup: () => void;
}

/** The conversation list follows committed receiver pages. In a live journal
 * page every non-removed root is a newly admitted packet, so it is its
 * conversation's latest message and is published directly. A removal or edit
 * of the shown preview, recovery rows and non-journal cuts keep the bounded
 * list read, deferred until it is allowed. */
export class ReceiptPreviews {
  private readonly ports: ReceiptPreviewPorts;
  private lookupNeeded = false;
  constructor(ports: ReceiptPreviewPorts) {
    this.ports = ports;
  }
  commit(receipt: ReceiptCommit): void {
    if (!this.publish(receipt)) this.lookupNeeded = true;
  }
  /** After the receiver page settles, run one list read if a page needed it. */
  settle(): void {
    if (!this.lookupNeeded || !this.ports.lookupAllowed()) return;
    this.lookupNeeded = false;
    this.ports.lookup();
  }
  /** Returns whether the page was fully reflected without a list read. */
  private publish(receipt: ReceiptCommit): boolean {
    if (!receipt.items.length) return true;
    if (!receipt.journal || !this.ports.online()) return false;
    const live = new Set(receipt.items.map((item) => item.id));
    if (receipt.views.some((view) => !live.has(view.id))) return false;
    const skipped = new Set([...receipt.covered, ...this.ports.excluded()]);
    let handled = true;
    for (const [peer, items] of byPeer(receipt)) {
      if (skipped.has(peer)) continue;
      handled = this.publishPeer(peer, items, receipt.views) && handled;
    }
    return handled;
  }
  private publishPeer(
    peer: string,
    items: readonly MessageItem[],
    views: readonly MessageView[],
  ): boolean {
    const shown = this.ports.previews.values.get(peer);
    if (items.some((item) => changesShown(item, shown))) return false;
    const rows = views.filter(
      (view) => view.peer === peer && !view.relation && view.kind !== 'profile',
    );
    const latest = Math.max(0, ...rows.map((row) => row.sequence ?? 0));
    if (!rows.length || (shown && shown.sequence >= latest)) return true;
    publishVerifiedConversationPreview({
      rows,
      projection: { peer, latest: true },
      previews: this.ports.previews,
      online: true,
      localOnly: false,
    });
    return true;
  }
}

function byPeer(receipt: ReceiptCommit): Map<string, MessageItem[]> {
  const peers = new Map<string, MessageItem[]>();
  for (const item of receipt.items) {
    const peer = messagePeer(receipt.account, item);
    peers.set(peer, [...(peers.get(peer) ?? []), item]);
  }
  return peers;
}

/** Older removals and edits leave a newer shown preview unchanged. */
function changesShown(
  item: MessageItem,
  shown: ConversationPreview | undefined,
): boolean {
  if (!shown) return false;
  if (item.deleted)
    return item.id === shown.id || item.relation?.id === shown.id;
  return item.relation?.type === 'edit' && item.relation.id === shown.id;
}
