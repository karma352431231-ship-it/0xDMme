import { showPublicAvatar } from '../public-media/index.ts';
import type { SocialDms } from '../social-dm/index.ts';
import type { PublicProfile } from '../../shared/public-profile/index.ts';
interface ResultTarget {
  id: string;
  sequence: number;
}
/** Presentation of public-only local search; the DM owner handles opening and verified reveal. */
export class DmSearch {
  private readonly source: Pick<SocialDms, 'search'>;
  private readonly open: (peer: string, target?: ResultTarget) => void;
  constructor(
    source: Pick<SocialDms, 'search'>,
    open: (peer: string, target?: ResultTarget) => void,
  ) {
    this.source = source;
    this.open = open;
  }
  async page(query: string, after: string | null) {
    const result = await this.source.search(query, after);
    return {
      items: result.items,
      next: result.next,
      entries: result.profiles.map((profile) => this.entry(profile)),
    };
  }
  private entry(profile: PublicProfile) {
    return {
      id: profile.id,
      kind: 'contact' as const,
      title: `@${profile.handle}`,
      searchText: profile.handle,
      selected: false,
      detail: '',
      seed: profile.id,
      avatar: (host: HTMLElement, signal: AbortSignal) => {
        if (profile.avatar)
          showPublicAvatar(host, {
            kind: 'avatar',
            target: profile.id,
            reference: profile.avatar,
            signal,
          });
      },
      open: () => this.open(profile.id),
      reveal: (id: string, sequence: number) =>
        this.open(profile.id, { id, sequence }),
    };
  }
}
