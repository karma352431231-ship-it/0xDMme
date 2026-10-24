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
  DiscussionSelection,
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
  element: HTMLElement;
  preview: HTMLElement;
  highlight: HTMLElement | null;
  highlightId: string | null;
}
interface ThreadRow {
  node: HTMLElement;
  branch: Branch | null;
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
    this.host.setAttribute('aria-label', t('Post discussion'));
    const toolbar = el('div', '', 'post-thread-toolbar');
    const heading = el('h3', t('Replies'), 'community-thread-heading');
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
      t('Sort comments'),
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
      if (
        branch.parent.status !== 'visible' ||
        (branch.highlightId === post.id && post.status !== 'visible')
      ) {
        if (branch.children.hidden) {
          this.clearPreview(branch);
          this.collapsedToggle(branch);
        } else {
          branch.highlight = null;
          branch.highlightId = null;
        }
      }
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
    selection: DiscussionSelection,
  ): Promise<DiscussionPage> {
    const { order, after, preview } = selection;
    const query = new URLSearchParams({ order });
    if (after) query.set('after', after);
    if (preview) query.set('preview', preview);
    return discussionPage(
      this.actions.request
        ? await this.actions.request({ post: parent, ...selection })
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
    const page = await this.read(parent.id, { order, after, preview: 'top' });
    if (!this.valid()) return;
    this.order = order;
    this.after = after;
    if (!this.snapshot.changed(JSON.stringify([parent.id, order, after]), page))
      return;
    this.replacePage(page);
    this.paging.replaceChildren();
    if (after)
      button(this.paging, t('Back to start'), () =>
        this.actions.run(() => this.page(parent, null)),
      );
    if (page.next)
      button(this.paging, t('View other comments'), () =>
        this.actions.run(() => this.page(parent, page.next)),
      );
  }
  private replacePage(page: DiscussionPage): void {
    this.branches.clear();
    this.actions.cleanup(this.replies);
    this.replies.replaceChildren();
    const previews = new Map(
      (page.previews ?? []).map((post) => [post.parent, post]),
    );
    for (const post of page.items) {
      const branch = this.row(this.replies, post, 0).branch,
        preview = previews.get(post.id);
      if (branch && preview) this.showPreview(branch, preview);
    }
    if (!page.items.length)
      this.replies.append(
        el('p', t('No replies yet.'), 'community-thread-empty'),
      );
  }
  private row(
    container: HTMLElement,
    post: CommunityPost,
    depth: number,
  ): ThreadRow {
    const item = el('div', '', 'post-thread-item');
    container.append(item);
    this.actions.render(item, post);
    return {
      node: item,
      branch: post.replies ? this.branch(item, post, depth + 1) : null,
    };
  }
  private continue(container: HTMLElement, post: CommunityPost): void {
    link(
      container,
      t('Continue this thread →'),
      `#communities?id=${this.actions.community}&post=${post.id}`,
    );
  }
  private branch(
    container: HTMLElement,
    parent: CommunityPost,
    depth: number,
  ): Branch {
    const wrap = el('section', '', 'post-thread-branch'),
      preview = el('div', '', 'post-thread-preview'),
      children = el('div', '', 'post-thread-children'),
      controls = el('div', '', 'post-thread-more');
    wrap.setAttribute('aria-label', t('Replies to this comment'));
    if (depth >= 4) wrap.classList.add('post-thread-deep');
    preview.hidden = true;
    preview.setAttribute('role', 'region');
    preview.setAttribute('aria-label', t('Top voted reply'));
    wrap.append(preview);
    const toggle = button(
      wrap,
      t('＋ View {0} {1}', [
        parent.replies,
        parent.replies === 1 ? t('reply') : t('replies'),
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
      element: wrap,
      preview,
      highlight: null,
      highlightId: null,
    };
    this.branches.set(parent.id, branch);
    return branch;
  }
  private showPreview(branch: Branch, post: CommunityPost): void {
    const row = this.row(branch.preview, post, branch.depth);
    branch.highlight = row.node;
    branch.highlightId = post.id;
    branch.preview.hidden = false;
    this.collapsedToggle(branch);
  }
  private collapsedToggle(branch: Branch): void {
    const remaining = Math.max(
      0,
      branch.parent.replies - (branch.highlightId ? 1 : 0),
    );
    branch.toggle.hidden = remaining === 0;
    branch.toggle.textContent = branch.highlightId
      ? remaining === 1
        ? t('＋ View 1 more reply')
        : t('＋ View {0} more replies', [remaining])
      : t('＋ View {0} {1}', [
          remaining,
          remaining === 1 ? t('reply') : t('replies'),
        ]);
    branch.toggle.setAttribute('aria-expanded', 'false');
  }
  private clearPreview(branch: Branch): void {
    this.forget(branch.preview);
    this.actions.cleanup(branch.preview);
    branch.preview.replaceChildren();
    branch.preview.hidden = true;
    branch.highlight = null;
    branch.highlightId = null;
  }
  private collapse(branch: Branch): void {
    const highlight = branch.highlight;
    if (highlight) {
      for (const child of this.branches.values())
        if (highlight.contains(child.element)) this.collapse(child);
      branch.preview.append(highlight);
      branch.preview.hidden = false;
    }
    this.forget(branch.children);
    this.actions.cleanup(branch.children);
    branch.children.replaceChildren();
    branch.controls.replaceChildren();
    branch.queue = [];
    branch.next = null;
    branch.loaded = false;
    branch.children.hidden = true;
    this.collapsedToggle(branch);
  }
  private async toggle(branch: Branch): Promise<void> {
    if (!branch.children.hidden) {
      this.collapse(branch);
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
      if (this.branches.get(branch.parent.id) !== branch) continue;
      branch.children.hidden = false;
      branch.toggle.hidden = false;
      branch.toggle.textContent = t('− Collapse replies');
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
    const page = await this.read(branch.parent.id, {
      order: 'votes',
      after: branch.next,
    });
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
    if (branch.children.hidden) this.clearPreview(branch);
    for (const post of branch.queue.splice(0, this.capacity())) {
      const child = this.appendPost(branch, post);
      if (child) pending.push(child);
    }
    if (!branch.children.children.length && !branch.next)
      branch.children.append(
        el(
          'p',
          t('No more replies available to display.'),
          'community-thread-empty',
        ),
      );
    this.moreControl(branch);
  }
  /** The first visible child can return to the preview when the branch closes. */
  private appendPost(branch: Branch, post: CommunityPost): Branch | null {
    const row = this.row(branch.children, post, branch.depth);
    if (branch.depth === 1 && !branch.highlight && post.status === 'visible') {
      branch.highlight = row.node;
      branch.highlightId = post.id;
    }
    return row.branch;
  }
  private moreControl(branch: Branch): void {
    branch.controls.replaceChildren();
    if (!branch.queue.length && !branch.next) return;
    const remaining = Math.max(
      1,
      branch.parent.replies - branch.children.children.length,
    );
    button(branch.controls, t('＋ View {0} more replies', [remaining]), () =>
      this.actions.run(() => this.expand(branch)),
    );
  }
}
