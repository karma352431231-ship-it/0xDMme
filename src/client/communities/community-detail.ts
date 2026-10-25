import { t, currentLanguage } from '../../shared/i18n/index.ts';
import { communityHref } from '../../shared/app-routes/index.ts';
import type {
  Community,
  CommunityState,
} from '../../shared/communities/index.ts';
import { publicProfileGuidanceButton } from '../public-action-guidance/index.ts';
import type { PublicActionGate } from '../public-action-guidance/index.ts';
import { renderMentions } from '../public-mentions/index.ts';
import type { Communities } from './controller.ts';
import type { CommunityScreen } from './screen.ts';
import { communityElement, communityButton } from './elements.ts';
import { communityAbout, communityCreationDate } from './community-about.ts';
import { mountCommunityFollowerPreview } from './followers.ts';
import { classificationBadges } from './classification.ts';
import { communityAvatar } from './presentation.ts';
import { CommunityPhotos } from './community-photos.ts';
interface DetailOptions {
  controller: Pick<Communities, 'request'>;
  participation: Pick<PublicActionGate, 'allow'>;
  screen: () => CommunityScreen | null;
  run: (work: () => Promise<void>) => Promise<void>;
  saveFollow: (data: Record<string, unknown>) => Promise<void>;
}
/** Owns community identity/participation presentation and its public image resources. */
export class CommunityDetailView {
  private readonly options: DetailOptions;
  private readonly photos = new CommunityPhotos();
  constructor(options: DetailOptions) {
    this.options = options;
  }
  release(container?: HTMLElement | null): void {
    this.photos.clear(container);
  }
  replaceHeader(screen: CommunityScreen, value: Community): void {
    const header = screen.host.querySelector<HTMLElement>(
      '.community-post-back',
    );
    if (!header) return;
    this.photos.clear(header);
    header.replaceWith(
      this.backHeader(value, communityHref(value), screen.signal),
    );
  }
  /** Banner, identity, followers and participation belong to the same hero. */
  summary(
    screen: CommunityScreen,
    value: Community,
    state: CommunityState | null,
  ): void {
    const hero = communityElement('section', '', 'community-hero');
    hero.setAttribute('aria-label', t('Community {0}', [value.name]));
    screen.host.append(hero);
    const avatar = communityAvatar(value.name);
    const banner = communityElement('div', '', 'community-banner');
    banner.dataset['tone'] = avatar.dataset['tone'] ?? '0';
    if (value.banner)
      this.photos.show(banner, {
        kind: 'community-banner',
        target: value.id,
        reference: value.banner,
        signal: screen.signal,
      });
    const head = communityElement('div', '', 'community-hero-head');
    const title = communityElement('div', '', 'community-hero-title');
    title.append(
      communityElement('h1', value.name),
      ...(value.archived
        ? [communityElement('p', t('Archived'), 'community-hero-meta')]
        : []),
    );
    head.append(avatar, title);
    hero.append(banner, head);
    this.photos.avatar(avatar, value, screen.signal);
    // The follower line sits under the name, aligned with it.
    mountCommunityFollowerPreview(title, {
      id: value.id,
      total: value.followers,
      signedIn: state !== null,
      controller: this.options.controller,
      signal: screen.signal,
    });
    title.append(
      communityCreationDate(value),
      classificationBadges(value.classification),
    );
    if (value.description) {
      const description = communityElement(
        'p',
        '',
        'community-hero-description',
      );
      renderMentions(description, value.description);
      hero.append(description);
    }
    const about = communityAbout(value);
    if (about) hero.append(about);
    if (!state) {
      publicProfileGuidanceButton(
        head,
        'follow-community',
        screen.signal,
      ).className = 'community-follow';
      return;
    }
    this.participant(head, state);
  }
  private communityFollowControl(card: HTMLElement, own: CommunityState): void {
    if (own.role !== 'owner') {
      communityButton(
        card,
        own.following ? t('follow.following') : t('Follow'),
        () =>
          this.options.run(async () => {
            const screen = this.options.screen();
            if (!screen) return;
            const pending = screen.signal;
            if (
              (await this.options.participation.allow(
                'follow-community',
                pending,
              )) &&
              screen.current() &&
              !pending.aborted
            )
              await this.options.saveFollow({
                id: own.community.id,
                following: !own.following,
              });
          }),
      );
      const follow = card.lastElementChild;
      follow?.classList.add('community-follow');
      follow?.setAttribute('aria-pressed', String(own.following));
    }
  }
  private participant(card: HTMLElement, own: CommunityState): void {
    this.communityFollowControl(card, own);
    if (!own.canPost)
      card.after(
        communityElement(
          'p',
          own.community.archived
            ? t('Participation ended: community archived.')
            : t('Your participation is suspended.'),
          'community-hero-notice',
        ),
      );
    if (own.sanction) {
      const s = own.sanction;
      card.append(
        communityElement('p', t('Reason: {0}', [s.reason])),
        communityElement(
          'p',
          s.until
            ? t('Until {0}', [
                new Date(s.until).toLocaleString(currentLanguage()),
              ])
            : t('Reversible ban'),
        ),
      );
      if (s.appeal)
        card.append(communityElement('p', t('Appeal: {0}', [s.appeal])));
      if (s.decision)
        card.append(communityElement('p', t('Reply: {0}', [s.decision])));
    }
  }
  /** The arrow returns to the source; identity enters the community in place. */
  backHeader(value: Community, href: string, signal: AbortSignal): HTMLElement {
    const header = communityElement('div', '', 'community-post-back'),
      arrow = communityElement('a', '←', 'community-post-back-arrow'),
      identity = communityElement('a', '', 'community-post-back-identity'),
      avatar = communityAvatar(value.name);
    arrow.href = href;
    arrow.title = t('Back');
    arrow.setAttribute('aria-label', t('Back'));
    identity.href = communityHref(value);
    identity.append(avatar, communityElement('span', value.name));
    header.append(arrow, identity);
    this.photos.avatar(avatar, value, signal);
    return header;
  }
}
