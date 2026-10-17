import { t, translatedError } from '../../shared/i18n/index.ts';
import { withoutBookmarkState } from './post-bookmark.ts';
import type { AccountSession } from '../../shared/account/index.ts';
import type { FeedEntry } from '../../shared/community-discovery/index.ts';
import { postSharing } from './post-sharing.ts';
import { postState } from '../../shared/community-posts/index.ts';
import type { PostState } from '../../shared/community-posts/index.ts';
import { communityState } from '../../shared/communities/index.ts';
import type { VaultAccess } from '../vault-authority/index.ts';
import type { ExternalMediaConsent } from '../external-media/index.ts';
import { Communities } from './controller.ts';
import { renderActivityEntry } from './activity-entry.ts';
import { communityElement as el } from './elements.ts';
import { postVoting, preferenceControls } from './discovery-controls.ts';
import { postManagementMenu } from './post-menu.ts';
import { postReply } from './post-reply.ts';
import { postViews } from './post-views.ts';

interface ActivityCard {
  entry: FeedEntry;
  node: HTMLElement;
  parentSignal: AbortSignal;
  signal: AbortSignal;
  lifetime: AbortController;
  busy: boolean;
  stop: () => void;
}
/** Public reads stay public; private controls use the existing community API. */
export class ActivityPosts {
  private readonly controller: Communities;
  private readonly privacy: ExternalMediaConsent;
  private session: AccountSession | null = null;
  private epoch = 0;
  private pending = 0;
  private sessionAbort = new AbortController();
  private readonly cards = new Set<ActivityCard>();
  constructor(access: VaultAccess, privacy: ExternalMediaConsent) {
    this.controller = new Communities(access);
    this.privacy = privacy;
    globalThis.window?.addEventListener('0xdmme-public-block', (event) =>
      this.hideBlockedAuthor(event),
    );
  }
  private hideBlockedAuthor(event: Event): void {
    if (!(event instanceof CustomEvent)) return;
    const data = event.detail as { target?: unknown; blocked?: unknown };
    if (typeof data?.target !== 'string' || data?.blocked !== true) return;
    for (const card of this.cards) {
      if (this.hasAuthor(card.entry, data.target)) {
        card.lifetime.abort();
        card.node.remove();
      }
    }
  }
  private hasAuthor(entry: FeedEntry, target: string): boolean {
    return [
      entry.post.author?.id,
      entry.context?.root.author?.id,
      entry.context?.parent.author?.id,
      entry.share?.author.id,
    ].includes(target);
  }
  setSession(session: AccountSession | null): void {
    if (!this.controller.setSession(session)) return;
    this.session = session;
    this.epoch++;
    this.sessionAbort.abort();
    this.sessionAbort = new AbortController();
    for (const card of this.cards) {
      card.entry = withoutBookmarkState(card.entry);
      this.toolbar(card);
    }
  }
  canActivate(): boolean {
    return (
      this.pending === 0 &&
      !Array.from(this.cards).some((card) =>
        Array.from(
          card.node.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
            '.reply-box textarea, .reply-box input',
          ),
        ).some(
          (field) =>
            field.value ||
            (field instanceof HTMLInputElement && field.files?.length),
        ),
      )
    );
  }
  render(entry: FeedEntry, parentSignal: AbortSignal): HTMLElement {
    const lifetime = new AbortController(),
      signal = AbortSignal.any([parentSignal, lifetime.signal]);
    const card: ActivityCard = {
      entry,
      parentSignal,
      signal,
      lifetime,
      busy: false,
      stop: () => {},
      node: renderActivityEntry(entry, signal, this.privacy),
    };
    this.cards.add(card);
    signal.addEventListener(
      'abort',
      () => {
        card.stop();
        this.cards.delete(card);
      },
      { once: true },
    );
    this.toolbar(card);
    window.addEventListener(
      '0xdmme-post-share',
      (event) => {
        if (!(event instanceof CustomEvent)) return;
        const detail = event.detail as { post?: unknown; shared?: unknown };
        if (
          card.entry.share?.own &&
          detail.post === card.entry.post.id &&
          detail.shared === false
        ) {
          card.lifetime.abort();
          card.node.remove();
        }
      },
      { signal },
    );
    return card.node;
  }
  private access(card: ActivityCard) {
    const epoch = this.epoch;
    return {
      controller: this.controller,
      valid: () => !card.signal.aborted && epoch === this.epoch,
      run: (work: () => Promise<void>) => this.run(card, epoch, work),
      changed: (state?: PostState) => {
        if (state) this.counts(card, state);
        else {
          card.lifetime.abort();
          card.node.remove();
        }
        return Promise.resolve();
      },
    };
  }
  private toolbar(card: ActivityCard): void {
    card.stop();
    card.node
      .querySelectorAll(
        '.post-actions, .reply-box, .post-options, .activity-post-status',
      )
      .forEach((node) => node.remove());
    const toolbar = el('div', '', 'post-actions'),
      status = el('p', '', 'community-feedback activity-post-status'),
      actions = this.access(card),
      post = card.entry.post;
    status.setAttribute('role', 'status');
    card.node.append(toolbar, status);
    let closeReply: () => void = () => {};
    postVoting(
      toolbar,
      post,
      this.session
        ? { ...actions, position: card.entry.viewerVote ?? 0 }
        : null,
    );
    if (this.session) {
      closeReply = postReply(toolbar, post, {
        ...actions,
        media: this.media(card),
        canReply: async () =>
          (await this.controller.state(post.community)).canPost,
        replied: (state) => this.replied(card, state),
      });
      postSharing(toolbar, post, {
        ...actions,
        shared: card.entry.viewerShared ?? false,
      });
      preferenceControls(toolbar, post, {
        ...actions,
        saved: card.entry.viewerSaved,
        options: (host) => this.options(card, host),
      });
    } else {
      const login = el('a', t('Responder'), 'post-action post-comments');
      login.href = '#settings';
      login.setAttribute('aria-label', t('Entre pelo Perfil para responder'));
      toolbar.append(login);
      postSharing(toolbar, post, null);
    }
    // Card clicks still use the existing panel/return navigation without a CTA.
    const discussion = el('a', '', 'post-discussion');
    discussion.hidden = true;
    discussion.href = `#communities?id=${post.community}&post=${post.id}`;
    toolbar.append(discussion);
    const stopViews = postViews(card.node, post, toolbar);
    card.stop = () => {
      closeReply();
      stopViews();
    };
  }
  private media(card: ActivityCard) {
    const { valid } = this.access(card);
    return {
      community: card.entry.post.community,
      request: (operation: string, data: Record<string, unknown>) =>
        this.controller.request(operation, data),
      valid,
      signal: AbortSignal.any([card.signal, this.sessionAbort.signal]),
      privacy: this.privacy,
    };
  }
  private async run(
    card: ActivityCard,
    epoch: number,
    work: () => Promise<void>,
  ): Promise<void> {
    if (card.busy || card.signal.aborted || epoch !== this.epoch) return;
    card.busy = true;
    this.pending++;
    const controls = Array.from(
        card.node.querySelectorAll<
          | HTMLButtonElement
          | HTMLInputElement
          | HTMLTextAreaElement
          | HTMLSelectElement
        >('button, input, textarea, select'),
      ),
      previous = controls.map((control) => control.disabled);
    controls.forEach((control) => {
      control.disabled = true;
    });
    try {
      await work();
    } catch (error: unknown) {
      if (!card.signal.aborted && epoch === this.epoch)
        this.status(
          card,
          error instanceof Error
            ? translatedError(error.message)
            : t('Operação indisponível.'),
        );
    } finally {
      this.pending--;
      card.busy = false;
      controls.forEach((control, index) => {
        control.disabled = previous[index]!;
      });
    }
  }
  private status(card: ActivityCard, text: string): void {
    const status = card.node.querySelector('.activity-post-status');
    if (status) status.textContent = text;
  }
  private counts(card: ActivityCard, state: PostState): void {
    card.entry = {
      ...card.entry,
      post: state.post,
      viewerVote: state.vote.position,
    };
    for (const button of card.node.querySelectorAll<HTMLElement>('[data-vote]'))
      button.setAttribute(
        'aria-pressed',
        String(Number(button.dataset['vote']) === state.vote.position),
      );
    const score = card.node.querySelector('.post-score'),
      replies = card.node.querySelector('.post-comments span');
    if (score) score.textContent = String(state.post.score);
    if (replies) replies.textContent = String(state.post.replies);
    this.status(card, t('Alteração salva.'));
  }
  private async replied(card: ActivityCard, reply: PostState): Promise<void> {
    const { valid } = this.access(card),
      post = card.entry.post;
    this.status(card, t('Resposta publicada.'));
    const link = el('a', t('Ver resposta publicada'));
    link.href = `#communities?id=${post.community}&post=${reply.post.id}`;
    card.node.querySelector('.activity-post-status')?.append(' ', link);
    try {
      const parent = postState(
        await this.controller.request('post-state', {
          id: post.community,
          post: post.id,
        }),
      );
      if (!valid()) return;
      this.counts(card, parent);
      this.status(card, t('Resposta publicada.'));
      card.node.querySelector('.activity-post-status')?.append(' ', link);
    } catch (error: unknown) {
      if (valid())
        card.node
          .querySelector('.activity-post-status')
          ?.append(
            el(
              'span',
              error instanceof Error
                ? t(' Contagem indisponível: {0}', [
                    translatedError(error.message),
                  ])
                : t(' Contagem indisponível.'),
            ),
          );
    }
  }
  private options(card: ActivityCard, host: HTMLElement) {
    const access = this.access(card);
    return postManagementMenu(host, card.entry.post, {
      run: access.run,
      request: (operation, data) => this.controller.request(operation, data),
      media: this.media(card),
      mutate: (operation, data) =>
        access.run(() => this.mutate(card, operation, data)),
    });
  }
  private async mutate(
    card: ActivityCard,
    operation: string,
    data: Record<string, unknown> | (() => Promise<Record<string, unknown>>),
  ): Promise<void> {
    const { valid } = this.access(card);
    const payload = typeof data === 'function' ? await data() : data;
    if (!valid()) return;
    const result = await this.controller.request(operation, payload);
    if (!valid()) return;
    if (operation === 'report') {
      communityState(result);
      this.status(card, t('Denúncia enviada.'));
      return;
    }
    const state = postState(result);
    if (state.post.status !== 'visible') {
      card.lifetime.abort();
      card.node.remove();
      return;
    }
    const entry = { ...card.entry, post: state.post };
    card.lifetime.abort();
    card.node.replaceWith(this.render(entry, card.parentSignal));
  }
}
