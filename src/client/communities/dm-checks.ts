import { checksIcon, messageChecks } from '../message-status/index.ts';
import type { SocialDms } from '../social-dm/index.ts';

/** Update just the metadata; media, draft, scroll position and bubbles are preserved. */
export async function refreshDmChecks(input: {
  history: HTMLElement;
  controller: SocialDms;
  peer: string;
  items: Array<{ id: string; own: boolean }>;
  usable: () => boolean;
}): Promise<void> {
  const status = await input.controller.messageStates({
    peer: input.peer,
    read:
      document.visibilityState === 'visible'
        ? input.items.filter((item) => !item.own).map((item) => item.id)
        : [],
    own: input.items.filter((item) => item.own).map((item) => item.id),
  });
  if (!input.usable()) return;
  const byId = new Map(status.map((item) => [item.id, item]));
  for (const row of input.history.querySelectorAll<HTMLElement>(
    '[data-message]',
  )) {
    const state = byId.get(row.dataset['message'] ?? '');
    row.querySelector('.dm-message-checks')?.remove();
    if (!state) continue;
    const checks = messageChecks({
      own: true,
      delivery: state.received ? 'received' : 'accepted',
      read: state.read,
    });
    if (!checks) continue;
    const meta = document.createElement('div');
    meta.className = 'message-meta dm-message-checks';
    meta.append(checksIcon(checks));
    row.append(meta);
  }
}
