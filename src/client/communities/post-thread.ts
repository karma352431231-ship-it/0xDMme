import { t } from '../../shared/i18n/index.ts';
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
import { PostSnapshot } from './post-snapshot.ts';
import { editedPost } from './post-edit-update.ts';
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
  loaded: boolean;
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
  private readonly snapshot = new PostSnapshot();
  private readonly branches = new Map<string, Branch>();
  async refresh(parent: CommunityPost): Promise<void> {
    await this.page(parent, this.after);
  }
  constructor(actions: ThreadActions) {
    this.actions = actions;
  }
  async mount(container: HTMLElement, parent: CommunityPost): Promise<void> {
    this.order = parent.parent ? 'votes' : 'discussed';
    this.host.setAttribute('aria-label', t('Discussão da postagem'));
    const toolbar = el('div', '', 'post-thread-toolbar');
    const heading = el('h3', t('Respostas'), 'community-thread-heading');
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
      t('Ordenar comentários'),
      {
        value: this.order,
        options: discussionOrders.map(
          ([value, label]) => [value, t(label)] as const,
        ),
      },
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
    this.branches.clear();
  }
  accept(post: CommunityPost): void {
    this.snapshot.accept(post);
    for (const branch of this.branches.values()) {
      branch.parent = editedPost(branch.parent, post);
      branch.queue = branch.queue.map((previous) => editedPost(previous, post));
    }
  }
  private forget(container: HTMLElement): void {
    for (const [id, branch] of this.branches) {
      if (branch.children !== container && container.contains(branch.children))
        this.branches.delete(id);
    }
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
    if (!this.snapshot.changed(JSON.stringify([parent.id, order, after]), page))
      return;
    this.branches.clear();
    this.actions.cleanup(this.replies);
    this.replies.replaceChildren();
    for (const post of page.items) this.row(this.replies, post, 0);
    if (!page.items.length)
      this.replies.append(
        el('p', t('Ainda não há respostas.'), 'community-thread-empty'),
      );
    this.paging.replaceChildren();
    if (after)
      button(this.paging, t('Voltar ao início'), () =>
        this.actions.run(() => this.page(parent, null)),
      );
    if (page.next)
      button(this.paging, t('Ver outros comentários'), () =>
        this.actions.run(() => this.page(parent, page.next)),
      );
  }
  private row(
    container: HTMLElement,
    post: CommunityPost,
    depth: number,
  ): Branch | null {
    const item = el('div', '', 'post-thread-item');
    container.append(item);
    this.actions.render(item, post);
    if (!post.replies) return null;
    return this.branch(item, post, depth + 1);
  }
  private continue(container: HTMLElement, post: CommunityPost): void {
    link(
      container,
      t('Continuar este fio →'),
      `#communities?id=${this.actions.community}&post=${post.id}`,
    );
  }
  private branch(
    container: HTMLElement,
    parent: CommunityPost,
    depth: number,
  ): Branch {
    const wrap = el('section', '', 'post-thread-branch'),
      children = el('div', '', 'post-thread-children'),
      controls = el('div', '', 'post-thread-more');
    wrap.setAttribute('aria-label', t('Respostas a este comentário'));
    if (depth >= 4) wrap.classList.add('post-thread-deep');
    const toggle = button(
      wrap,
      t('＋ Ver {0} {1}', [
        parent.replies,
        parent.replies === 1 ? t('resposta') : t('respostas'),
      ]),
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
      loaded: false,
    };
    this.branches.set(parent.id, branch);
    return branch;
  }
  private async toggle(branch: Branch): Promise<void> {
    if (!branch.children.hidden) {
      this.forget(branch.children);
      this.actions.cleanup(branch.children);
      branch.children.replaceChildren();
      branch.controls.replaceChildren();
      branch.queue = [];
      branch.next = null;
      branch.loaded = false;
      branch.children.hidden = true;
      branch.toggle.textContent = t('＋ Ver {0} respostas', [
        branch.parent.replies,
      ]);
      branch.toggle.setAttribute('aria-expanded', 'false');
      return;
    }
    await this.expand(branch);
  }
  private capacity(): number {
    return 120 - this.host.querySelectorAll('.post-thread-item').length;
  }
  private async expand(start: Branch): Promise<void> {
    const pending = [
      start,
      ...[...this.branches.values()].filter(
        (branch) =>
          branch !== start &&
          start.children.contains(branch.children) &&
          (branch.children.hidden ||
            branch.queue.length > 0 ||
            branch.next !== null),
      ),
    ];
    const deadline = Date.now() + 20_000;
    let remaining = 120;
    while (this.mayExpand(pending, deadline, remaining--)) {
      const branch = pending.shift()!;
      await this.more(branch, pending);
      if (!this.valid()) return;
      branch.children.hidden = false;
      branch.toggle.textContent = t('− Recolher respostas');
      branch.toggle.setAttribute('aria-expanded', 'true');
      if (branch.queue.length || branch.next) pending.push(branch);
    }
    if (!pending.length || !this.valid()) return;
    start.controls.replaceChildren();
    if (this.capacity() <= 0) this.continue(start.controls, pending[0]!.parent);
    else
      button(start.controls, t('thread.load-remaining'), () =>
        this.actions.run(() => this.expand(start)),
      );
  }
  private mayExpand(
    pending: readonly Branch[],
    deadline: number,
    remaining: number,
  ): boolean {
    return (
      pending.length > 0 &&
      this.valid() &&
      this.capacity() > 0 &&
      remaining > 0 &&
      Date.now() < deadline
    );
  }
  private async fill(branch: Branch): Promise<boolean> {
    if (branch.queue.length) return true;
    if (branch.loaded && !branch.next) return false;
    const page = await this.read(branch.parent.id, 'votes', branch.next);
    if (!this.valid() || this.branches.get(branch.parent.id) !== branch)
      return false;
    branch.loaded = true;
    branch.queue = page.items;
    branch.next = page.next;
    return true;
  }
  private async more(branch: Branch, pending: Branch[]): Promise<void> {
    // One expansion is bounded by 120 nodes/reads, one page per branch and a 20-second scheduling window.
    // Deeper replies flatten their indentation rather than requiring repeated navigation.
    if (this.capacity() <= 0) {
      branch.controls.replaceChildren();
      this.continue(branch.controls, branch.parent);
      return;
    }
    if (!(await this.fill(branch))) return;
    for (const post of branch.queue.splice(0, this.capacity())) {
      const child = this.row(branch.children, post, branch.depth);
      if (child) pending.push(child);
    }
    if (!branch.children.children.length && !branch.next)
      branch.children.append(
        el(
          'p',
          t('Não há outras respostas disponíveis para exibir.'),
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
    button(branch.controls, t('＋ Ver {0} outras respostas', [remaining]), () =>
      this.actions.run(() => this.expand(branch)),
    );
  }
}
