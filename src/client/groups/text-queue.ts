import { TextSendQueue } from '../text-send/index.ts';
import type { TextDraft } from '../text-send/index.ts';

/** Group texts leave the composer at once, as private ones do: each is saved
 * in admission order to its own group's encrypted outbox under its queue ID,
 * and one transmission sends every group with unsent drafts. A transmission
 * ends when the server accepted and the outbox was cleared; the readback is
 * only requested, so the next batch never waits for it. Attachments and
 * voice keep their foreground path. */
export function groupTextQueue(options: {
  save: (
    groupId: string,
    draft: { id: string; text: string; order: number },
  ) => Promise<void>;
  /** Sends one group's drafts; false when the send did not run. */
  send: (groupId: string) => Promise<boolean>;
  /** A group's drafts were accepted; request its readback without waiting. */
  sent: (groupId: string) => void;
  available: () => boolean;
  changed: () => void;
  failed: (error: unknown) => void;
  draftChanged?: (
    draft: TextDraft,
    phase: 'admitted' | 'saved' | 'save-failed',
  ) => void;
}): TextSendQueue {
  const unsent = new Set<string>();
  let last = 0;
  // Saves run one at a time, so this order is the admission order even when
  // two texts share a millisecond.
  const order = (createdAt: number): number =>
    (last = Math.max(last + 1, createdAt * 1000));
  /** A send that fails or throws keeps its group and the rest unsent. */
  const attempt = async (
    groupId: string,
    remaining: string[],
  ): Promise<boolean> => {
    let ok = false;
    try {
      ok = await options.send(groupId);
    } finally {
      if (!ok) for (const left of remaining) unsent.add(left);
    }
    return ok;
  };
  return new TextSendQueue({
    save: async (draft) => {
      await options.save(draft.peer, {
        id: draft.id,
        text: draft.text,
        order: order(draft.createdAt ?? Date.now()),
      });
      unsent.add(draft.peer);
    },
    // Texts saved while a send runs mark their group again for the next one.
    transmit: async () => {
      const groups = [...unsent];
      unsent.clear();
      for (const [index, groupId] of groups.entries()) {
        if (!(await attempt(groupId, groups.slice(index))))
          return { ok: false, more: true };
        options.sent(groupId);
      }
      return { ok: true, more: unsent.size > 0 };
    },
    available: options.available,
    changed: options.changed,
    failed: options.failed,
    ...(options.draftChanged ? { draftChanged: options.draftChanged } : {}),
  });
}
