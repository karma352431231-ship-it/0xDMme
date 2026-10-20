import { AccountError } from '../../shared/account/index.ts';
import {
  communityCursor,
  communityPage,
} from '../../shared/communities/index.ts';
import type { CommunityPage } from '../../shared/communities/index.ts';
import { mentionQuery } from '../../shared/public-mentions/index.ts';
type Directory = {
  list: (after: string | null) => Promise<CommunityPage>;
  suggestions?: (query: string) => Promise<CommunityPage>;
};
function single(address: URL, allowed: string): string | null {
  if (
    [...address.searchParams.keys()].some(
      (key) => key !== allowed || address.searchParams.getAll(key).length !== 1,
    )
  )
    throw new AccountError(400, 'Invalid filters.');
  return address.searchParams.get(allowed);
}
export async function directoryLookup(
  address: URL,
  source: Directory,
): Promise<CommunityPage | null> {
  if (address.pathname === '/api/communities/suggestions' && source.suggestions)
    return communityPage(
      await source.suggestions(mentionQuery(single(address, 'q'))),
    );
  if (address.pathname === '/api/communities')
    return communityPage(
      await source.list(communityCursor(single(address, 'after'))),
    );
  return null;
}
