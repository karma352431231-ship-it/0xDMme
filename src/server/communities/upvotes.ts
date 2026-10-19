import { AccountError, uuid } from '../../shared/account/index.ts';
import { communityCursor } from '../../shared/communities/index.ts';
import { upvoterPage } from '../../shared/public-upvotes/index.ts';

export async function upvoterLookup(
  address: URL,
  read?: (
    community: string,
    post: string,
    after: string | null,
  ) => Promise<unknown>,
): Promise<unknown> {
  if (
    !read ||
    !/^\/api\/communities\/[a-f0-9-]{36}\/posts\/[a-f0-9-]{36}\/upvoters$/u.test(
      address.pathname,
    )
  )
    throw new AccountError(404, 'Post unavailable.');
  if (
    [...address.searchParams.keys()].some((key) => key !== 'after') ||
    address.searchParams.getAll('after').length > 1
  )
    throw new AccountError(400, 'Invalid filters.');
  const parts = address.pathname.split('/');
  return upvoterPage(
    await read(
      uuid(parts[3]),
      uuid(parts[5]),
      communityCursor(address.searchParams.get('after')),
    ),
  );
}
