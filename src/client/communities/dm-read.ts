import { refreshDmChecks } from './dm-checks.ts';
import type { VaultWorkOptions } from '../vault-authority/index.ts';
import type { SocialDms } from '../social-dm/index.ts';

/** Read only a still-visible verified page. Local notification state is
 * independent of whether the account shares read receipts with the sender. */
export async function readVisibleDm(input: {
  history: HTMLElement;
  controller: Pick<SocialDms, 'messageStates' | 'markRead'>;
  peer: string;
  page: {
    items: { id: string; own: boolean; sequence: number }[];
    reactionReads: string[];
  };
  work?: VaultWorkOptions;
  usable: () => boolean;
  changed: () => void;
}): Promise<void> {
  if (!input.usable()) return;
  await refreshDmChecks({
    ...input,
    items: input.page.items,
    reactionReads: input.page.reactionReads,
  });
  const received = input.page.items.filter((item) => !item.own);
  if (!input.usable() || !received.length) return;
  await input.controller.markRead(
    input.peer,
    Math.max(...received.map((item) => item.sequence)),
    input.work,
  );
  if (input.usable()) input.changed();
}
