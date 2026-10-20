import { AccountError, uuid } from '../../shared/account/index.ts';
import { publicProfile } from '../../shared/public-profile/index.ts';
import { mentionQuery } from '../../shared/public-mentions/index.ts';
import type { PublicProfileService } from './service.ts';
type Ports = Partial<Pick<PublicProfileService, 'readById' | 'suggestions'>>;
function queryOf(address: URL): string {
  if (
    [...address.searchParams.keys()].some((key) => key !== 'q') ||
    address.searchParams.getAll('q').length !== 1
  )
    throw new AccountError(400, 'Invalid search.');
  return mentionQuery(address.searchParams.get('q'));
}
/** Adapts two anonymous lookups; returned identities contain only public fields. */
export async function mentionLookup(
  address: URL,
  ports?: Ports,
): Promise<unknown> {
  if (
    address.pathname === '/api/public-profiles/_/suggestions' &&
    ports?.suggestions
  ) {
    const items = await ports.suggestions(queryOf(address));
    if (items.length > 8) throw new AccountError(503, 'Invalid suggestions.');
    return items.map(publicProfile);
  }
  if (
    address.pathname.startsWith('/api/public-profiles/id/') &&
    ports?.readById
  ) {
    if (address.search) throw new AccountError(400, 'Invalid search.');
    return publicProfile(
      await ports.readById(
        uuid(address.pathname.slice('/api/public-profiles/id/'.length)),
      ),
    );
  }
  return null;
}
