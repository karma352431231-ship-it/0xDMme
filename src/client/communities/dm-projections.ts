import type { SocialDms } from '../social-dm/index.ts';
import type { SocialRelation } from '../../shared/social-dm/index.ts';
import type { PublicProfile } from '../../shared/public-profile/index.ts';

export interface DmProjection {
  value: SocialRelation;
  profile: PublicProfile;
  page: Awaited<ReturnType<SocialDms['cached']>>;
  offline: false;
}
/** Memory only, at most eight confirmed recent pages and one MiB combined.
 * The UI clears all entries on stream loss, security hints or session changes. */
export class DmProjections {
  private readonly pages = new Map<
    string,
    { data: DmProjection; bytes: number }
  >();
  private bytes = 0;
  clear(): void {
    this.pages.clear();
    this.bytes = 0;
  }
  get(peer: string, connected: boolean): DmProjection | null {
    return connected ? (this.pages.get(peer)?.data ?? null) : null;
  }
  remember(
    data: {
      value: SocialRelation | null;
      profile: PublicProfile | null;
      page: DmProjection['page'] | undefined;
      offline: boolean;
    },
    state: { current: boolean; live: boolean; before: number | null },
  ): void {
    if (!state.current || !state.live || state.before !== null || data.offline)
      return;
    if (!data.value || !data.profile || !data.page) return;
    this.store({
      value: data.value,
      profile: data.profile,
      page: data.page,
      offline: false,
    });
  }
  private store(data: DmProjection): void {
    const peer = data.value.peer.id;
    this.remove(peer);
    if (
      !data.value.canSend ||
      data.value.blocked ||
      data.page.items.length > 16
    )
      return;
    const bytes = new TextEncoder().encode(JSON.stringify(data)).length;
    if (bytes > 1_048_576) return;
    while (this.pages.size >= 8 || this.bytes + bytes > 1_048_576) {
      const oldest = this.pages.keys().next().value;
      if (oldest === undefined) return;
      this.remove(oldest);
    }
    this.pages.set(peer, { data, bytes });
    this.bytes += bytes;
  }
  private remove(peer: string): void {
    this.bytes -= this.pages.get(peer)?.bytes ?? 0;
    this.pages.delete(peer);
  }
}
