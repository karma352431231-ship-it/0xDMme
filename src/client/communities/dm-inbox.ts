import { DmUnreadUpdates } from './dm-unread-updates.ts';
import type { SocialDms } from '../social-dm/index.ts';

/** Account wakeups outlive DM views; session replacement releases listeners. */
class DmInbox {
  private readonly updates: DmUnreadUpdates;
  private lifecycle: AbortController | null = null;
  constructor(updates: DmUnreadUpdates) {
    this.updates = updates;
  }
  reset(active: boolean): void {
    this.lifecycle?.abort();
    this.lifecycle = null;
    this.updates.reset(active);
  }
  start(): void {
    if (!this.lifecycle) {
      this.lifecycle = new AbortController();
      const options = { signal: this.lifecycle.signal },
        resume = () => this.updates.request();
      document.addEventListener('visibilitychange', resume, options);
      document.addEventListener('resume', resume, options);
      window.addEventListener('online', resume, options);
      window.addEventListener('pageshow', resume, options);
    }
    this.updates.start();
  }
  invalidate(): void {
    this.updates.invalidate();
  }
  request(): void {
    this.updates.request();
  }
}

/** The account inbox receives authenticated history without mounting a DM.
 * Notification projection still reads local cursors and never marks a chat read. */
export function createDmInbox(
  controller: Pick<SocialDms, 'list' | 'receive' | 'unread'>,
  changed: (count: number) => void,
): DmInbox {
  return new DmInbox(
    new DmUnreadUpdates({
      page: async (after) => {
        const page = await controller.list(after);
        return { peers: page.items.map((row) => row.peer.id), next: page.next };
      },
      prepare: () => controller.receive(),
      count: (peers) => controller.unread(peers),
      changed,
    }),
  );
}
