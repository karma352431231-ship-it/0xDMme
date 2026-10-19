/**
 * Growth shown beside a community in the ranking sidebar: active members in
 * the selected period compared with the previous period of the same length,
 * as a raw percent with no cap and no "forming" label (owner decision of
 * 16/10/2026, docs/RANKING_COMUNIDADES_TRENDING.md). Since 19/10/2026 an empty
 * previous period counts as a base of 1, so 0 → 1,000 shows ▲ 100,000%:
 * explosive growth must read as explosive.
 */
export function rankingGrowth(input: {
  participants: number;
  previous: number;
}): number {
  const base = Math.max(input.previous, 1);
  return ((input.participants - input.previous) / base) * 100;
}
