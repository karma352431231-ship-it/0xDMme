import type { AccountSession } from '../../shared/account/index.ts';
import type { FeedEntry } from '../../shared/community-discovery/index.ts';
import { postState, tagPage } from '../../shared/community-posts/index.ts';
import type { PostState } from '../../shared/community-posts/index.ts';
import { communityState } from '../../shared/communities/index.ts';
import type { VaultAccess } from '../vault-authority/index.ts';
import type { ExternalMediaConsent } from '../external-media/index.ts';
import { Communities, communityRead } from './controller.ts';
import { renderActivityEntry } from './activity-entry.ts';
import {
  communityButton as button,
  communityElement as el,
} from './elements.ts';
import { postVoting, preferenceControls } from './discovery-controls.ts';
import { postActions } from './post-forms.ts';
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
  }
  setSession(session: AccountSession | null): void {
    if (!this.controller.setSession(session)) return;
    this.session = session;
    this.epoch++;
    this.sessionAbort.abort();
    this.sessionAbort = new AbortController();
    for (const card of this.cards) this.toolbar(card);
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
    postVoting(toolbar, post, this.session ? actions : null);
    if (this.session) {
      postReply(toolbar, post, {
        ...actions,
        media: this.media(card),
        canReply: async () =>
          (await this.controller.state(post.community)).canPost,
        replied: (state) => this.replied(card, state),
      });
      preferenceControls(toolbar, post, actions);
      const options = el('div', '', 'post-options');
      status.before(options);
      button(toolbar, 'Opções', () =>
        actions.run(() => this.options(card, options)),
      ).setAttribute('aria-label', 'Opções da postagem');
    } else {
      const login = el('a', 'Responder', 'post-action post-comments');
      login.href = '#perfil';
      login.setAttribute('aria-label', 'Entre pelo Perfil para responder');
      toolbar.append(login);
    }
    const discussion = el(
      'a',
      'Abrir discussão',
      'post-action post-discussion',
    );
    discussion.href = `#comunidades?id=${post.community}&post=${post.id}`;
    toolbar.append(discussion);
    card.stop = postViews(card.node, post, toolbar);
  }
  private media(card: ActivityCard) {
    const { valid } = this.access(card);
    return {
      community: card.entry.post.community,
      request: (operation: string, data: Record<string, unknown>) =>
        this.controller.request(operation, data),
      valid,
      signal: AbortSignal.any([card.signal, this.sessionAbort.signal]),
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
          error instanceof Error ? error.message : 'Operação indisponível.',
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
    card.entry = { ...card.entry, post: state.post };
    const score = card.node.querySelector('.post-score'),
      replies = card.node.querySelector('.post-comments span');
    if (score) score.textContent = String(state.post.score);
    if (replies) replies.textContent = String(state.post.replies);
    this.status(card, 'Alteração salva.');
  }
  private async replied(card: ActivityCard, reply: PostState): Promise<void> {
    const { valid } = this.access(card),
      post = card.entry.post;
    this.status(card, 'Resposta publicada.');
    const link = el('a', 'Ver resposta publicada');
    link.href = `#comunidades?id=${post.community}&post=${reply.post.id}`;
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
      this.status(card, 'Resposta publicada.');
      card.node.querySelector('.activity-post-status')?.append(' ', link);
    } catch (error: unknown) {
      if (valid())
        card.node
          .querySelector('.activity-post-status')
          ?.append(
            el(
              'span',
              error instanceof Error
                ? ` Contagem indisponível: ${error.message}`
                : ' Contagem indisponível.',
            ),
          );
    }
  }
  private async options(card: ActivityCard, host: HTMLElement): Promise<void> {
    const access = this.access(card),
      post = card.entry.post,
      state = postState(
        await this.controller.request('post-state', {
          id: post.community,
          post: post.id,
        }),
      );
    const tags =
      state.canEdit && !post.parent
        ? tagPage(await this.tags(card, null))
        : { items: [], next: null };
    if (!access.valid()) return;
    host.replaceChildren();
    postActions(
      host,
      state,
      {
        page: tags,
        run: access.run,
        load: async (after) => tagPage(await this.tags(card, after)),
      },
      {
        run: access.run,
        request: (operation, data) => this.controller.request(operation, data),
        media: this.media(card),
        mutate: (operation, data) =>
          access.run(() => this.mutate(card, operation, data)),
      },
    );
  }
  private tags(card: ActivityCard, after: string | null): Promise<unknown> {
    const query = after ? `?after=${encodeURIComponent(after)}` : '';
    return communityRead(
      `/api/communities/${card.entry.post.community}/tags${query}`,
      AbortSignal.any([card.signal, AbortSignal.timeout(8000)]),
    );
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
      this.status(card, 'Denúncia enviada.');
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
