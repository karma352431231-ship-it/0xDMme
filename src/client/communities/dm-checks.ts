import { checksIcon, messageChecks } from '../message-status/index.ts';
import type { SocialDms } from '../social-dm/index.ts';
import type { VaultWorkOptions } from '../vault-authority/index.ts';
import { WindowReceipts } from '../history-window/index.ts';
const reactionReads = new WeakMap<
  HTMLElement,
  {
    controller: Pick<SocialDms, 'messageStates'>;
    peer: string;
    ids: Set<string>;
  }
>();
/** A deep window asks checks a page of ids at a time (history-window). */
const windowChecks = new WeakMap<
  HTMLElement,
  {
    peer: string;
    read: WindowReceipts<never>;
    own: WindowReceipts<{ received: boolean; read: boolean }>;
  }
>();
export function clearDmChecks(history: HTMLElement): void {
  reactionReads.delete(history);
  windowChecks.delete(history);
}
function checksFor(history: HTMLElement, peer: string) {
  let held = windowChecks.get(history);
  if (held?.peer !== peer) {
    held = { peer, read: new WindowReceipts(), own: new WindowReceipts() };
    windowChecks.set(history, held);
  }
  return held;
}

/** Update just the metadata; media, draft, scroll position and bubbles are preserved. */
export async function refreshDmChecks(input: {
  history: HTMLElement;
  controller: Pick<SocialDms, 'messageStates'>;
  peer: string;
  items: Array<{ id: string; own: boolean }>;
  usable: () => boolean;
  reactionReads?: readonly string[];
  work?: VaultWorkOptions;
}): Promise<void> {
  if (!(await readDmReactions(input))) return;
  const held = checksFor(input.history, input.peer),
    reads =
      document.visibilityState === 'visible'
        ? held.read.batches(
            input.items.filter((item) => !item.own).map((item) => item.id),
          )
        : [],
    owns = held.own.batches(
      input.items.filter((item) => item.own).map((item) => item.id),
    );
  for (let page = 0; page < Math.max(reads.length, owns.length); page++) {
    const batch = { read: reads[page] ?? [], own: owns[page] ?? [] };
    const status = await input.controller.messageStates(
      { peer: input.peer, ...batch },
      input.work,
    );
    if (!input.usable()) return;
    held.read.answered(batch.read);
    held.own.answered(
      batch.own,
      new Map(status.map((item) => [item.id, item])),
    );
  }
  for (const row of input.history.querySelectorAll<HTMLElement>(
    '[data-message]',
  )) {
    patchDmCheck(row, held.own.state(row.dataset['message'] ?? ''));
  }
}

function patchDmCheck(
  row: HTMLElement,
  state: { received: boolean; read: boolean } | undefined,
): void {
  row.querySelector('.dm-message-checks')?.remove();
  if (!state) return;
  const checks = messageChecks({
    own: true,
    delivery: state.received ? 'received' : 'accepted',
    read: state.read,
  });
  if (!checks) return;
  const meta = document.createElement('div');
  meta.className = 'dm-message-checks';
  meta.append(checksIcon(checks));
  row.querySelector('.message-meta')?.append(meta);
}

function unreadReactions(input: Parameters<typeof refreshDmChecks>[0]): {
  ids: string[];
  seen: Set<string>;
} {
  let held = reactionReads.get(input.history);
  if (
    !held ||
    held.peer !== input.peer ||
    held.controller !== input.controller
  ) {
    held = { controller: input.controller, peer: input.peer, ids: new Set() };
    reactionReads.set(input.history, held);
  }
  if (held.ids.size > 4096) held.ids.clear();
  return {
    seen: held.ids,
    ids: (input.reactionReads ?? []).filter((id) => !held.ids.has(id)),
  };
}
async function readDmReactions(
  input: Parameters<typeof refreshDmChecks>[0],
): Promise<boolean> {
  if (!input.usable()) return false;
  const { ids, seen } = unreadReactions(input);
  for (let offset = 0; offset < ids.length; offset += 16) {
    if (!input.usable() || document.visibilityState !== 'visible') return false;
    const batch = ids.slice(offset, offset + 16);
    await input.controller.messageStates(
      {
        peer: input.peer,
        own: [],
        read: batch,
      },
      input.work,
    );
    if (!input.usable()) return false;
    for (const id of batch) seen.add(id);
  }
  return input.usable();
}
