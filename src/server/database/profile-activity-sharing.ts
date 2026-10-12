import type { FeedPage } from '../../shared/community-discovery/index.ts';
import type { PublicProfile } from '../../shared/public-profile/index.ts';
export async function attachProfileShares(input: {
  rows: { id: string; shared_at?: Date | null }[];
  page: FeedPage;
  viewer: string | null;
  author: () => Promise<PublicProfile | null>;
}): Promise<FeedPage> {
  const shared = new Map(
    input.rows
      .filter((row) => row.shared_at)
      .map((row) => [row.id, row.shared_at!]),
  );
  if (!shared.size) return input.page;
  const author = await input.author();
  if (!author) return input.page;
  return {
    ...input.page,
    items: input.page.items.map((entry) => {
      const at = entry.activityId ? shared.get(entry.activityId) : null;
      return at
        ? {
            ...entry,
            share: {
              id: entry.activityId!,
              createdAt: at.toISOString(),
              author,
              ...(input.viewer ? { own: author.id === input.viewer } : {}),
            },
          }
        : entry;
    }),
  };
}
