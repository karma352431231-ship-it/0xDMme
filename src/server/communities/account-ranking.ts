import { AccountError } from '../../shared/account/index.ts';
import {
  accountRankingPage,
  accountRankingOrder,
} from '../../shared/account-ranking/index.ts';
import type {
  AccountRankingPage,
  AccountRankingOrder,
} from '../../shared/account-ranking/index.ts';
import { rankingPeriod } from '../../shared/community-ranking/index.ts';
import type { RankingPeriod } from '../../shared/community-ranking/index.ts';

/** Public account ranking route; source calculation stays with the producer. */
export async function accountRankingLookup(
  address: URL,
  read:
    | ((
        period: RankingPeriod,
        after: string | null,
        order?: AccountRankingOrder,
      ) => Promise<AccountRankingPage>)
    | undefined,
): Promise<AccountRankingPage> {
  if (!read) throw new AccountError(404, 'Discovery unavailable.');
  const query = address.searchParams;
  if (
    [...query.keys()].some(
      (key) =>
        !['period', 'after', 'order'].includes(key) ||
        query.getAll(key).length !== 1,
    )
  )
    throw new AccountError(400, 'Invalid filters.');
  const order = accountRankingOrder(query.get('order') ?? 'trending');
  if (order === 'following')
    throw new AccountError(403, 'Feed restricted to your own account.');
  return accountRankingPage(
    await read(
      rankingPeriod(query.get('period') ?? 'day'),
      query.get('after'),
      order,
    ),
  );
}
