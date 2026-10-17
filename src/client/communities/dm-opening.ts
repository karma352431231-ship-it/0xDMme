import { socialRelation } from '../../shared/social-dm/index.ts';
import type { SocialRelation } from '../../shared/social-dm/index.ts';

/** Open only a new/legacy conversation. Ordinary refreshes remain read-only. */
export async function openDmConversation(
  source: {
    state: (peer: string) => Promise<SocialRelation | null>;
    request: (
      operation: string,
      data: Record<string, unknown>,
    ) => Promise<unknown>;
  },
  peer: string,
  usable: () => boolean,
): Promise<SocialRelation> {
  const value = await source.state(peer);
  if (!usable()) throw new DOMException('DM encerrada.', 'AbortError');
  if (
    value &&
    (value.state === 'approved' ||
      value.blocked ||
      (value.state !== 'none' && !value.canSend))
  )
    return value;
  return socialRelation(await source.request('open', { peer }));
}
