import { TextSendQueue } from '../text-send/index.ts';
import type { TextDraft, TextTransmitResult } from '../text-send/index.ts';

/** Group texts leave the composer at once, as private ones do: each is saved
 * in admission order to its own group's encrypted outbox under its queue ID,
 * and one transmission sends every group with unsent drafts. A transmission
 * ends when the server accepted and the outbox was cleared. It requests no
 * readback: the accepted rows stay shown until a verified read the group
 * needs anyway settles them. Attachments and voice keep their foreground
 * path. */
export function groupTextQueue(options: {
  save: (
    groupId: string,
    draft: { id: string; text: string; order: number },
  ) => Promise<void>;
  /** Sends one group's drafts; false when the send did not run. */
  send: (
    groupId: string,
    admitted: () => void,
  ) => Promise<boolean | 'deferred'>;
  available: () => boolean;
  changed: () => void;
  failed: (error: unknown) => void;
  observe?: ConstructorParameters<typeof TextSendQueue>[0]['observe'];
  blockedBy?: ConstructorParameters<typeof TextSendQueue>[0]['blockedBy'];
  timing?: ConstructorParameters<typeof TextSendQueue>[0]['timing'];
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
  let generation = 0;
  const attempt = async (
    groupId: string,
    turn: { remaining: string[]; generation: number },
    admitted: () => void,
  ) => {
    let result: boolean | 'deferred' = false;
    try {
      result = await options.send(groupId, admitted);
      return result;
    } finally {
      if (result !== true && turn.generation === generation)
        for (const left of turn.remaining) unsent.add(left);
    }
  };
  return new TextSendQueue({
    reset: () => {
      generation++;
      unsent.clear();
    },
    save: async (draft) => {
      const current = generation;
      await options.save(draft.peer, {
        id: draft.id,
        text: draft.text,
        order: order(draft.createdAt ?? Date.now()),
      });
      if (current === generation) unsent.add(draft.peer);
    },
    // Texts saved while a send runs mark their group again for the next one.
    transmit: async (admitted): Promise<TextTransmitResult> => {
      const current = generation;
      const groups = [...unsent];
      unsent.clear();
      for (const [index, groupId] of groups.entries()) {
        if (current !== generation) break;
        if (!options.available()) {
          for (const left of groups.slice(index)) unsent.add(left);
          return { ok: false, deferred: true, more: true };
        }
        const result = await attempt(
          groupId,
          { remaining: groups.slice(index), generation: current },
          admitted,
        );
        if (result === 'deferred')
          return { ok: false, deferred: true, more: true };
        if (!result) return { ok: false, more: true };
      }
      return { ok: true, more: unsent.size > 0 };
    },
    ...(options.observe ? { observe: options.observe } : {}),
    ...(options.blockedBy ? { blockedBy: options.blockedBy } : {}),
    ...(options.timing ? { timing: options.timing } : {}),
    available: options.available,
    changed: options.changed,
    failed: options.failed,
    ...(options.draftChanged ? { draftChanged: options.draftChanged } : {}),
  });
}
