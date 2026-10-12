import type {
  Community,
  CommunityState,
} from '../../shared/communities/index.ts';
import { readCommunity } from './controller.ts';

interface CommunityDetail {
  community: Community | null;
  state: CommunityState | null;
}

/** Publish public data and current permissions together, never an intermediate
 * signed-out screen. The caller must discard its view on a current failure. */
export async function readCommunityDetail(options: {
  id: string;
  signedIn: boolean;
  signal: AbortSignal;
  valid: () => boolean;
  state: (id: string) => Promise<CommunityState>;
  previous: CommunityDetail;
}) {
  const value = await readCommunity(options.id, options.signal);
  if (!options.valid()) return null;
  const state = options.signedIn ? await options.state(options.id) : null;
  if (!options.valid()) return null;
  const community = state?.community ?? value;
  const changed =
    JSON.stringify([community, state]) !==
    JSON.stringify([options.previous.community, options.previous.state]);
  return { community, state, changed };
}
