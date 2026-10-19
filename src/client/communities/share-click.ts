import type { CommunityPost } from '../../shared/community-posts/index.ts';

/** One random receipt per user action; bounded retries cannot duplicate it. */
export async function countShareClick(post: CommunityPost): Promise<boolean> {
  const token = Array.from(crypto.getRandomValues(new Uint8Array(16)), (v) =>
    v.toString(16).padStart(2, '0'),
  ).join('');
  const body = JSON.stringify({
    items: [{ community: post.community, post: post.id, token }],
  });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch('/api/communities/share-clicks', {
        method: 'POST',
        credentials: 'omit',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok) {
        const result: unknown = await response.json();
        return (
          typeof result === 'object' &&
          result !== null &&
          'accepted' in result &&
          result.accepted === true
        );
      }
      if (response.status < 500) return false;
    } catch {
      // Retry this same receipt once; an unavailable metric never blocks sharing.
    }
  }
  return false;
}
