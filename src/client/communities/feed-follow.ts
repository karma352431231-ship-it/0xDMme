import { t } from '../../shared/i18n/index.ts';
import { communityState } from '../../shared/communities/index.ts';
import type { ProfileFollow } from '../../shared/profile-social/index.ts';
import type { PublicProfile } from '../../shared/public-profile/index.ts';
import type { Communities } from './controller.ts';
import { communityButton as button } from './elements.ts';
import { chooseFeedFollow } from './feed-follow-choice.ts';

export interface FeedProfileFollows {
  inspect: (target: string) => Promise<ProfileFollow | null>;
  set: (target: string, state: ProfileFollow) => Promise<ProfileFollow>;
}
interface FollowOptions {
  controller: Communities;
  profiles: FeedProfileFollows;
  run: (work: () => Promise<void>) => Promise<void>;
  valid: () => boolean;
  changed: () => Promise<void>;
  signal: AbortSignal;
  chooseOnMobile: boolean;
}
/** Feed-only choice; desktop preserves the direct community control. */
export function feedFollowControl(
  header: HTMLElement,
  target: {
    community: { id: string; name: string; avatar?: string | null };
    author: PublicProfile | null;
  },
  options: FollowOptions,
): void {
  let following = false;
  const mobile = () =>
    options.chooseOnMobile && matchMedia('(max-width: 700px)').matches;
  const node = button(header, t('+ Follow'), () =>
    options
      .run(async () => {
        if (!options.valid()) return;
        if (mobile()) await choose();
        else await followCommunity(!following);
      })
      .finally(() => {
        if (options.valid() && node.isConnected) node.focus();
      }),
  );
  node.className = 'community-post-follow';
  const describe = () => {
    node.textContent = following ? t('follow.following') : t('+ Follow');
    node.setAttribute(
      'aria-label',
      mobile()
        ? t('Choose whether to follow the community or author')
        : t('{0} the community {1}', [
            following ? t('Unfollow') : t('Follow'),
            target.community.name,
          ]),
    );
    if (mobile()) node.setAttribute('aria-haspopup', 'dialog');
    else {
      node.removeAttribute('aria-haspopup');
      node.setAttribute('aria-pressed', String(following));
    }
  };
  async function followCommunity(value: boolean): Promise<void> {
    const state = communityState(
      await options.controller.request('follow', {
        id: target.community.id,
        following: value,
      }),
    );
    if (!options.valid()) return;
    following = state.following;
    describe();
    await options.changed();
  }
  async function choose(): Promise<void> {
    const choice = await chooseFeedFollow({
      community: target.community,
      author: target.author,
      signal: options.signal,
      load: async () => {
        const [state, author] = await Promise.all([
          options.controller.state(target.community.id),
          target.author
            ? options.profiles.inspect(target.author.id)
            : Promise.resolve(null),
        ]);
        return { community: state.following, author };
      },
    });
    if (!choice || !options.valid()) return;
    if (choice.target === 'community')
      await followCommunity(!choice.state.community);
    else if (target.author && choice.state.author) {
      await options.profiles.set(target.author.id, choice.state.author);
    }
  }
  describe();
}
