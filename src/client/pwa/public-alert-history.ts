import { uuid } from '../../shared/account/index.ts';
import { publicNotificationPreview } from '../../shared/public-notification/index.ts';
import type { PublicNotificationPreview } from '../../shared/public-notification/index.ts';

const cacheName = '0xdmme-public-alerts';
const path = '/.0xdmme/public-alerts';
interface History {
  scope: string;
  posts: string[];
}
/** One bounded record: session digest and at most 32 public post IDs. No author,
 * message text, wallet, private peer or read acknowledgement is persisted. */
export class PublicAlertHistory {
  private pending: History | null = null;
  async fresh(data: object): Promise<PublicNotificationPreview | null> {
    if ('call' in data && data.call === true) return null;
    if (!('publicPreview' in data) || data.publicPreview === undefined)
      return null;
    const preview = publicNotificationPreview(data.publicPreview);
    const scope = publicScope(data);
    if (!scope) return null;
    try {
      const posts = await previousPosts(scope);
      if (posts.includes(preview.post)) return null;
      this.pending = {
        scope,
        posts: [...posts.slice(-31), preview.post],
      };
      return preview;
    } catch {
      // Unavailable local history cannot attribute an aggregate wakeup to an old post.
      return null;
    }
  }
  async remember(): Promise<void> {
    if (!this.pending) return;
    const cache = await caches.open(cacheName);
    await cache.put(path, Response.json(this.pending));
  }
}
function readHistory(value: unknown): History {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('scope' in value) ||
    !('posts' in value)
  )
    throw new Error('Invalid public alert history.');
  const { scope, posts } = value;
  if (
    typeof scope !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(scope) ||
    !Array.isArray(posts) ||
    posts.length > 32
  )
    throw new Error('Invalid public alert history.');
  return { scope, posts: posts.map(uuid) };
}

function publicScope(data: object): string | null {
  if (!('publicScope' in data) || typeof data.publicScope !== 'string')
    return null;
  return /^[a-f0-9]{64}$/u.test(data.publicScope) ? data.publicScope : null;
}

async function previousPosts(scope: string): Promise<string[]> {
  const cache = await caches.open(cacheName);
  const stored = await cache.match(path);
  const previous = stored ? readHistory(await stored.json()) : null;
  return previous?.scope === scope ? previous.posts : [];
}
