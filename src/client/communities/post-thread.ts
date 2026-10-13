import type { CommunityPost } from '../../shared/community-posts/index.ts';
import {
  discussionOrder,
  discussionOrders,
  discussionPage,
} from '../../shared/community-discussion/index.ts';
import type {
  DiscussionOrder,
  DiscussionPage,
} from '../../shared/community-discussion/index.ts';
import { communityRead } from './controller.ts';
import { discoveryMenu } from './discovery-controls.ts';
import {
  communityElement as el,
  communityButton as button,
  communityLink as link,
} from './elements.ts';

interface ThreadActions {
  community: string;
  signal: AbortSignal;
  valid: () => boolean;
  run: (work: () => Promise<void>) => Promise<void>;
  render: (container: HTMLElement, post: CommunityPost) => void;
  cleanup: (container: HTMLElement) => void;
  request?: (payload: Record<string, unknown>) => Promise<unknown>;
}
interface Branch {
  parent: CommunityPost;
  depth: number;
  children: HTMLElement;
  controls: HTMLElement;
  toggle: HTMLButtonElement;
  queue: CommunityPost[];
  next: string | null;
}
/** Owns ordering, bounded tree rendering and asynchronous lifecycle, separate from post operations. */
export class PostThread {
  private readonly actions: ThreadActions;
  private readonly host = el('section', '', 'post-thread');
  private readonly replies = el('div', '', 'community-thread');
  private readonly ordering = el('div', '', 'post-thread-ordering');
  private readonly paging = el('div', '', 'post-thread-paging');
  private active = true;
  private order: DiscussionOrder = 'discussed';
  private after: string | null = null;
  private snapshot = '';
  async refresh(parent: CommunityPost): Promise<void> {
    await this.page(parent, this.after);
  }
  constructor(actions: ThreadActions) {
    this.actions = actions;
  }
  async mount(container: HTMLElement, parent: CommunityPost): Promise<void> {
    this.order = parent.parent ? 'votes' : 'discussed';
    this.host.setAttribute('aria-label', 'Discussão da postagem');
    const toolbar = el('div', '', 'post-thread-toolbar');
    const heading = el('h3', 'Respostas', 'community-thread-heading');
    if (parent.replies)
      heading.append(el('span', String(parent.replies), 'activity-count'));
    toolbar.append(heading);
    toolbar.append(this.ordering);
    this.select(parent);
    this.host.append(toolbar, this.replies, this.paging);
    container.append(this.host);
    await this.page(parent, null);
  }
  private select(parent: CommunityPost): void {
    this.ordering.replaceChildren();
    discoveryMenu(
      this.ordering,
      'Ordenar comentários',
      { value: this.order, options: discussionOrders },
      (value) => {
        const order = discussionOrder(value);
        void this.actions.run(async () => {
          try {
            await this.page(parent, null, order);
          } finally {
            if (this.valid()) this.select(parent);
          }
        });
      },
    );
  }
  dispose(): void {
    this.active = false;
  }
  private valid(): boolean {
    return this.active && !this.actions.signal.aborted && this.actions.valid();
  }
  private async read(
    parent: string,
    order: DiscussionOrder,
    after: string | null,
  ): Promise<DiscussionPage> {
    const query = new URLSearchParams({ order });
    if (after) query.set('after', after);
    return discussionPage(
      this.actions.request
        ? await this.actions.request({ post: parent, order, after })
        : await communityRead(
            `/api/communities/${this.actions.community}/posts/${parent}/replies?${query.toString()}`,
            AbortSignal.any([this.actions.signal, AbortSignal.timeout(8000)]),
          ),
    );
  }
  private async page(
    parent: CommunityPost,
    after: string | null,
    order: DiscussionOrder = this.order,
  ): Promise<void> {
    const page = await this.read(parent.id, order, after);
    if (!this.valid()) return;
    this.order = order;
    this.after = after;
    const snapshot = JSON.stringify([parent.id, order, after, page]);
    if (snapshot === this.snapshot) return;
    this.snapshot = snapshot;
    this.actions.cleanup(this.replies);
    this.replies.replaceChildren();
    for (const post of page.items) this.row(this.replies, post, 0);
    if (!page.items.length)
      this.replies.append(
        el('p', 'Ainda não há respostas.', 'community-thread-empty'),
      );
    this.paging.replaceChildren();
    if (after)
      button(this.paging, 'Voltar ao início', () =>
        this.actions.run(() => this.page(parent, null)),
      );
    if (page.next)
      button(this.paging, 'Ver outros comentários', () =>
        this.actions.run(() => this.page(parent, page.next)),
      );
  }
  private row(
    container: HTMLElement,
    post: CommunityPost,
    depth: number,
  ): void {
    const item = el('div', '', 'post-thread-item');
    container.append(item);
    this.actions.render(item, post);
    if (!post.replies) return;
    if (depth >= 3) {
      this.continue(item, post);
      return;
    }
    this.branch(item, post, depth + 1);
  }
  private continue(container: HTMLElement, post: CommunityPost): void {
    link(
      container,
      'Continuar este fio →',
      `#comunidades?id=${this.actions.community}&post=${post.id}`,
    );
  }
  private branch(
    container: HTMLElement,
    parent: CommunityPost,
    depth: number,
  ): void {
    const wrap = el('section', '', 'post-thread-branch'),
      children = el('div', '', 'post-thread-children'),
      controls = el('div', '', 'post-thread-more');
    wrap.setAttribute('aria-label', 'Respostas a este comentário');
    const toggle = button(
      wrap,
      `＋ Ver ${parent.replies} ${parent.replies === 1 ? 'resposta' : 'respostas'}`,
      () => this.actions.run(() => this.toggle(branch)),
    );
    toggle.className = 'post-thread-toggle';
    toggle.setAttribute('aria-expanded', 'false');
    children.id = `thread-${parent.id}`;
    toggle.setAttribute('aria-controls', children.id);
    children.hidden = true;
    wrap.append(children, controls);
    container.append(wrap);
    const branch: Branch = {
      parent,
      depth,
      children,
      controls,
      toggle,
      queue: [],
      next: null,
    };
  }
  private async toggle(branch: Branch): Promise<void> {
    if (!branch.children.hidden) {
      this.actions.cleanup(branch.children);
      branch.children.replaceChildren();
      branch.controls.replaceChildren();
      branch.queue = [];
      branch.next = null;
      branch.children.hidden = true;
      branch.toggle.textContent = `＋ Ver ${branch.parent.replies} respostas`;
      branch.toggle.setAttribute('aria-expanded', 'false');
      return;
    }
    await this.more(branch);
    if (!this.valid()) return;
    branch.children.hidden = false;
    branch.toggle.textContent = '− Recolher respostas';
    branch.toggle.setAttribute('aria-expanded', 'true');
  }
  private async more(branch: Branch): Promise<void> {
    // At most 120 reply nodes per view and one queued page (24) per opened branch.
    // A continuation opens the chosen subtree; no server-side depth/content limit.
    if (this.host.querySelectorAll('.post-thread-item').length >= 120) {
      branch.controls.replaceChildren();
      this.continue(branch.controls, branch.parent);
      return;
    }
    if (!branch.queue.length) {
      const page = await this.read(branch.parent.id, 'votes', branch.next);
      if (!this.valid()) return;
      branch.queue = page.items;
      branch.next = page.next;
    }
    const slots = 120 - this.host.querySelectorAll('.post-thread-item').length;
    for (const post of branch.queue.splice(0, Math.min(3, slots)))
      this.row(branch.children, post, branch.depth);
    if (!branch.children.children.length && !branch.next)
      branch.children.append(
        el(
          'p',
          'Não há outras respostas disponíveis para exibir.',
          'community-thread-empty',
        ),
      );
    this.moreControl(branch);
  }
  private moreControl(branch: Branch): void {
    branch.controls.replaceChildren();
    if (!branch.queue.length && !branch.next) return;
    const remaining = Math.max(
      1,
      branch.parent.replies - branch.children.children.length,
    );
    button(branch.controls, `＋ Ver ${remaining} outras respostas`, () =>
      this.actions.run(() => this.more(branch)),
    );
  }
}
