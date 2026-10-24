import { t } from '../../shared/i18n/index.ts';
import type { Communities } from './controller.ts';
import type { CommunityScreen } from './screen.ts';
import { upvoteNoticePage } from '../../shared/public-upvotes/index.ts';
import { replyNotificationPage } from '../../shared/community-posts/index.ts';
import type { ReplyNotification } from '../../shared/community-posts/index.ts';
import { publicationNotificationRow } from './notification-row.ts';
import {
  communityButton,
  communityCard,
  communityElement,
} from './elements.ts';
/** Owns notification pagination and the acknowledgement contracts also used by Activity. */
export class CommunityNotifications {
  private readonly controller: Pick<Communities, 'request'>;
  private readonly run: (work: () => Promise<void>) => Promise<void>;
  private cursor: string | null = null;
  constructor(options: {
    controller: Pick<Communities, 'request'>;
    run: (work: () => Promise<void>) => Promise<void>;
  }) {
    this.controller = options.controller;
    this.run = options.run;
  }
  resetPage(): void {
    this.cursor = null;
  }
  async publications(): Promise<readonly ReplyNotification[]> {
    return replyNotificationPage(
      await this.controller.request('post-notifications', {
        after: null,
        authors: true,
      }),
    ).items;
  }
  async upvotes() {
    return upvoteNoticePage(
      await this.controller.request('post-upvote-notifications', {
        after: null,
      }),
    ).items;
  }
  async markRepliesRead(replies: readonly string[]): Promise<void> {
    await this.controller.request('post-notifications-read', { replies });
  }
  async markUpvotesRead(ids: readonly string[]): Promise<void> {
    await this.controller.request('post-upvote-notifications-read', { ids });
  }
  async show(screen: CommunityScreen): Promise<void> {
    const page = replyNotificationPage(
      await this.controller.request('post-notifications', {
        after: this.cursor,
      }),
    );
    if (!screen.current()) return;
    screen.present();
    const card = communityCard(t('Notifications'));
    screen.host.append(card);
    card.append(
      communityElement(
        'p',
        t(
          'Replies to your content and posts/replies from accounts with notifications enabled.',
        ),
      ),
    );
    for (const item of page.items)
      card.append(
        publicationNotificationRow(item, {
          open: async (reply) => {
            await this.controller.request('post-notifications-read', {
              replies: [reply],
            });
          },
          current: () => screen.current(),
        }),
      );
    if (!page.items.length)
      card.append(communityElement('p', t('No notifications on this page.')));
    this.cursor = page.next;
    if (page.next)
      communityButton(card, t('Earlier notifications'), () =>
        this.run(() => this.show(screen)),
      );
    communityButton(card, t('Reload notifications'), () =>
      this.run(async () => {
        this.cursor = null;
        await this.show(screen);
      }),
    );
  }
}
