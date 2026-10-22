import { TextSendQueue } from '../text-send/index.ts';

/** Group texts leave the composer at once, as private ones do: each is saved
 * in order to its own group's encrypted outbox, and a single background
 * transmission sends whatever is pending, so a burst of messages never waits
 * for the previous send. Attachments and voice keep their foreground path. */
export function groupTextQueue(options: {
  save: (groupId: string, text: string) => Promise<void>;
  /** Sends the open group's pending drafts; false when the send did not run. */
  send: () => Promise<boolean>;
  more: () => Promise<boolean>;
  available: () => boolean;
  changed: () => void;
  failed: (error: unknown) => void;
}): TextSendQueue {
  return new TextSendQueue({
    save: (draft) => options.save(draft.peer, draft.text),
    transmit: async () => ({
      ok: await options.send(),
      more: await options.more(),
    }),
    available: options.available,
    changed: options.changed,
    failed: options.failed,
  });
}
