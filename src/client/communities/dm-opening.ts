import { socialRelation } from '../../shared/social-dm/index.ts';
import type { SocialRelation } from '../../shared/social-dm/index.ts';
import type { VaultWorkOptions } from '../vault-authority/index.ts';

/** Only an exposed conversation competes as foreground work; directory reads
 * and hidden-page automatic work retain the normal maintenance queue. */
export function dmConversationWork(): VaultWorkOptions {
  return document.visibilityState === 'visible'
    ? { priority: 'interactive' }
    : {};
}

/** Open only a new/legacy conversation. Ordinary refreshes remain read-only. */
export async function openDmConversation(
  source: {
    state: (
      peer: string,
      options?: VaultWorkOptions,
    ) => Promise<SocialRelation | null>;
    request: (
      operation: string,
      data: Record<string, unknown>,
      options?: VaultWorkOptions,
    ) => Promise<unknown>;
  },
  peer: string,
  usable: () => boolean,
  options: VaultWorkOptions = {},
): Promise<SocialRelation> {
  const value = await source.state(peer, options);
  if (!usable()) throw new DOMException('DM ended.', 'AbortError');
  if (
    value &&
    (value.state === 'approved' ||
      value.blocked ||
      (value.state !== 'none' && !value.canSend))
  )
    return value;
  return socialRelation(await source.request('open', { peer }, options));
}
