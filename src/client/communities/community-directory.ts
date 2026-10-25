import { t } from '../../shared/i18n/index.ts';
import type { Communities } from './controller.ts';
import type { CommunityScreen } from './screen.ts';
import { communityHref } from '../../shared/app-routes/index.ts';
import type {
  Community,
  CommunityPage,
} from '../../shared/communities/index.ts';
import {
  communityButton,
  communityCard,
  communityElement,
  communityLink,
} from './elements.ts';
import { CommunityDirectory } from './directory-refresh.ts';
import type { DirectoryView } from './directory-refresh.ts';
import { CommunityPhotos } from './community-photos.ts';
import { communityAvatar } from './presentation.ts';
interface DirectoryOptions {
  controller: Pick<Communities, 'list'>;
  signal: () => AbortSignal;
  run: (work: () => Promise<void>) => Promise<void>;
}
/** Owns main-list pagination and followed-sidebar rendering, including avatars.
 * The existing sidebar snapshot owner continues to retain unchanged pages. */
export class CommunityDirectoryView {
  private readonly options: DirectoryOptions;
  private cursor: string | null = null;
  private readonly photos = new CommunityPhotos();
  private readonly followed: CommunityDirectory;
  constructor(options: DirectoryOptions) {
    this.options = options;
    this.followed = new CommunityDirectory({
      load: (after) => options.controller.list('following', after),
      created: () => options.controller.list('owned', null),
      rows: (host, page, view) => this.rows(host, page, view.selected),
      release: (host) => this.photos.clear(host),
      run: options.run,
    });
  }
  resetPage(): void {
    this.cursor = null;
  }
  resetSidebar(): void {
    this.followed.reset();
  }
  release(container?: HTMLElement | null): void {
    this.photos.clear(container);
  }
  sidebar(view: DirectoryView): Promise<void> {
    return this.followed.refresh(view);
  }
  private rows(
    container: HTMLElement,
    page: CommunityPage,
    selected: string | null,
  ): void {
    for (const item of page.items) {
      const row = communityElement('div', '', 'community-row');
      const a = communityElement('a', '', 'community-row-link'),
        avatar = communityAvatar(item.name),
        copy = communityElement('span', '', 'community-row-copy');
      a.href = communityHref(item);
      if (item.id === selected) a.setAttribute('aria-current', 'page');
      copy.append(
        communityElement('strong', item.name),
        communityElement('small', this.followerLabel(item)),
      );
      a.append(avatar, copy);
      row.append(a);
      container.append(row);
      this.photos.avatar(avatar, item, this.options.signal());
    }
    if (!page.items.length)
      container.append(
        communityElement('p', t('No communities in this list.')),
      );
  }
  private followerLabel(value: Community): string {
    return t('{0} {1}{2}', [
      value.followers,
      value.followers === 1 ? t('follower') : t('followers'),
      value.archived ? t(' · Archived') : '',
    ]);
  }
  async listing(screen: CommunityScreen, view: string): Promise<void> {
    const page = await this.options.controller.list(
      view === 'communities' ? 'following' : view,
      this.cursor,
    );
    if (!screen.current()) return;
    screen.present();
    const card = communityCard(
      view === 'invitations' ? t('Community transfers') : t('My communities'),
    );
    screen.host.append(card);
    if (view === 'communities') {
      const links = communityElement('nav', '', 'community-personal-links');
      links.setAttribute('aria-label', t('Your lists'));
      for (const [key, label] of [
        ['following', t('Following feed')],
        ['saved', t('Saved')],
        ['replies', t('Replies')],
        ['create', t('Create community')],
      ] as const)
        communityLink(links, label, `#communities?view=${key}`);
      card.append(links);
    }
    this.rows(card, page, null);
    this.cursor = page.next;
    if (page.next)
      communityButton(card, t('Next page'), () =>
        this.options.run(() => this.listing(screen, view)),
      );
    communityButton(card, t('Reload list'), () => {
      this.cursor = null;
      return this.options.run(() => this.listing(screen, view));
    });
  }
}
