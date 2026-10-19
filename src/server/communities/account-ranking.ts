import { AccountError } from '../../shared/account/index.ts';
import { accountRankingPage } from '../../shared/account-ranking/index.ts';
import type { AccountRankingPage } from '../../shared/account-ranking/index.ts';
import { rankingPeriod } from '../../shared/community-ranking/index.ts';
import type { RankingPeriod } from '../../shared/community-ranking/index.ts';

/** Public account ranking route; source calculation stays with the producer. */
export async function accountRankingLookup(
  address: URL,
  read:
    | ((
        period: RankingPeriod,
        after: string | null,
      ) => Promise<AccountRankingPage>)
    | undefined,
): Promise<AccountRankingPage> {
  if (!read) throw new AccountError(404, 'Descoberta indisponível.');
  const query = address.searchParams;
  if (
    [...query.keys()].some(
      (key) =>
        !['period', 'after'].includes(key) || query.getAll(key).length !== 1,
    )
  )
    throw new AccountError(400, 'Filtros inválidos.');
  return accountRankingPage(
    await read(rankingPeriod(query.get('period') ?? 'day'), query.get('after')),
  );
}
