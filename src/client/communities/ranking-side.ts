import { communityHref } from '../../shared/app-routes/index.ts';
import { currentLanguage, t } from '../../shared/i18n/index.ts';
import { explorePage } from '../../shared/community-discovery/index.ts';
import type { Community } from '../../shared/communities/index.ts';
import { communityTopics } from '../../shared/community-classification/index.ts';
import type { VaultAccess } from '../vault-authority/index.ts';
import { showPublicAvatar } from '../public-media/index.ts';
import { Communities, communityRead } from './controller.ts';
import { communityElement as el } from './elements.ts';
import { communityAvatar } from './presentation.ts';
import { topicDot } from './classification.ts';

/**
 * FOMO-style ranking beside the feed (docs/UI_PAINEIS_E_TEMAS.md, 16/10/2026).
 * Public ranking pages are read without credentials; Following uses the
 * signed list. While visible, the bar refreshes every few seconds and redraws
 * only when the server published a new ranking, so likes, replies and posts
 * show up within seconds. Rows are reused per community, so photos are not
 * fetched again on every refresh.
 */
export type RankingTab = 'trending' | 'size' | 'new' | 'following';
type Row = { community: Community; participants: number; previous: number };

const refreshMs = 4000;
const collapsedKey = '0xdmme:ranking-side-collapsed';
const tabs: readonly [RankingTab, string][] = [
  ['trending', 'ranking.trending'],
  ['size', 'ranking.largest'],
  ['new', 'ranking.new'],
  ['following', 'ranking.following'],
];

/** Growth of active members against the previous 24 hours, never capped. */
export function activeGrowth(current: number, previous: number): string {
  const format = new Intl.NumberFormat(currentLanguage());
  if (previous === 0)
    return current === 0
      ? t('ranking.active {0}', [format.format(0)])
      : t('ranking.active-new {0}', [format.format(current)]);
  const percent = Math.round(((current - previous) / previous) * 100);
  return t(percent >= 0 ? 'ranking.growth-up {0}' : 'ranking.growth-down {0}', [
    format.format(Math.abs(percent)),
  ]);
}

export function startRankingSide(options: {
  shell: HTMLElement;
  access: VaultAccess;
  signedIn: () => boolean;
}): { element: HTMLElement; refresh: () => void } {
  const controller = new Communities(options.access);
  const aside = el('aside', '', 'ranking-side');
  aside.setAttribute('aria-label', t('ranking.title'));
  const view = new RankingView(aside, {
    load: (tab, signal) => load(controller, tab, signal, options.signedIn),
  });
  options.shell.append(aside);
  const tick = () => {
    if (document.visibilityState === 'visible' && view.visible())
      void view.refresh();
  };
  setInterval(tick, refreshMs);
  document.addEventListener('visibilitychange', tick);
  return { element: aside, refresh: tick };
}

async function load(
  controller: Communities,
  tab: RankingTab,
  signal: AbortSignal,
  signedIn: () => boolean,
): Promise<{ key: string; rows: Row[] } | null> {
  if (tab === 'following') {
    if (!signedIn()) return null;
    const page = await controller.list('following', null);
    return {
      key: JSON.stringify(
        page.items.map((c) => [c.id, c.followers, c.revision]),
      ),
      rows: page.items.map((community) => ({
        community,
        participants: 0,
        previous: 0,
      })),
    };
  }
  const page = explorePage(
    await communityRead(
      `/api/communities/explore?order=${tab}&period=day`,
      AbortSignal.any([signal, AbortSignal.timeout(8000)]),
    ),
  );
  return {
    key: page.generation,
    rows: page.items.map((item) => ({
      community: item.community,
      participants: item.participants,
      previous: item.previousParticipants,
    })),
  };
}

class RankingView {
  private tab: RankingTab = 'trending';
  private key = '';
  private busy = false;
  private abort = new AbortController();
  private readonly rows = new Map<string, HTMLElement>();
  private readonly list: HTMLElement;
  private readonly status: HTMLElement;
  private readonly tabButtons = new Map<RankingTab, HTMLButtonElement>();
  private readonly host: HTMLElement;
  private readonly source: {
    load: (
      tab: RankingTab,
      signal: AbortSignal,
    ) => Promise<{ key: string; rows: Row[] } | null>;
  };
  constructor(host: HTMLElement, source: RankingView['source']) {
    this.host = host;
    this.source = source;
    this.list = el('div', '', 'ranking-side-list');
    this.status = el('p', '', 'ranking-side-status');
    this.status.setAttribute('role', 'status');
    host.append(this.header(), this.tabBar(), this.columns(), this.list);
    host.append(this.status, this.footer(), this.strip());
    this.setCollapsed(readCollapsed());
  }
  /** The list is on screen: not hidden by the layout nor collapsed. */
  visible(): boolean {
    return this.list.offsetParent !== null;
  }
  async refresh(force = false): Promise<void> {
    if (this.busy && !force) return;
    this.busy = true;
    const tab = this.tab;
    try {
      const page = await this.source.load(tab, this.abort.signal);
      if (tab === this.tab) this.apply(page, force);
    } catch {
      // A failed refresh keeps the last ranking; the next tick tries again.
      this.status.textContent = this.rows.size ? '' : t('ranking.unavailable');
    } finally {
      this.busy = false;
    }
  }
  /** Redraws only when the server published a different ranking. */
  private apply(page: { key: string; rows: Row[] } | null, force: boolean) {
    this.status.textContent = page ? '' : t('ranking.sign-in');
    if (!page || (page.key === this.key && !force)) return;
    this.key = page.key;
    this.render(page.rows);
  }
  private render(rows: Row[]): void {
    const seen = new Set<string>();
    rows.forEach((row, index) => {
      seen.add(row.community.id);
      const node = this.rows.get(row.community.id) ?? this.createRow(row);
      this.rows.set(row.community.id, node);
      fillRow(node, row, index + 1, this.tab);
      this.list.append(node);
    });
    for (const [id, node] of this.rows)
      if (!seen.has(id)) {
        node.remove();
        this.rows.delete(id);
      }
    if (!rows.length) this.status.textContent = t('ranking.empty');
    this.paintStrip(rows);
  }
  private createRow(row: Row): HTMLElement {
    const link = el('a', '', 'ranking-side-row');
    link.href = communityHref(row.community);
    const avatar = communityAvatar(row.community.name);
    link.append(
      el('span', '', 'ranking-side-rank'),
      avatar,
      el('span', '', 'ranking-side-copy'),
      el('span', '', 'ranking-side-numbers'),
    );
    if (row.community.avatar)
      showPublicAvatar(avatar, {
        kind: 'community-photo',
        target: row.community.id,
        reference: row.community.avatar,
        signal: this.abort.signal,
      });
    return link;
  }
  private select(tab: RankingTab): void {
    if (tab === this.tab) return;
    this.tab = tab;
    this.key = '';
    for (const [id, button] of this.tabButtons)
      button.setAttribute('aria-pressed', String(id === tab));
    this.list.replaceChildren();
    this.rows.clear();
    void this.refresh(true);
  }
  private header(): HTMLElement {
    const head = el('div', '', 'ranking-side-head');
    head.append(el('strong', t('ranking.title')));
    head.append(this.toggle('»', 'ranking.collapse', true));
    return head;
  }
  private toggle(
    symbol: string,
    label: string,
    collapse: boolean,
  ): HTMLButtonElement {
    const button = el('button', symbol, 'ranking-side-toggle');
    button.type = 'button';
    button.setAttribute('aria-label', t(label));
    button.title = t(label);
    button.addEventListener('click', () => {
      this.setCollapsed(collapse);
      if (!collapse) void this.refresh(true);
    });
    return button;
  }
  private tabBar(): HTMLElement {
    const bar = el('div', '', 'ranking-side-tabs');
    for (const [id, label] of tabs) {
      const button = el('button', t(label));
      button.type = 'button';
      button.setAttribute('aria-pressed', String(id === this.tab));
      button.addEventListener('click', () => this.select(id));
      this.tabButtons.set(id, button);
      bar.append(button);
    }
    return bar;
  }
  private columns(): HTMLElement {
    const row = el('div', '', 'ranking-side-columns');
    row.append(
      el('span', t('ranking.community')),
      el('span', t('ranking.window')),
    );
    return row;
  }
  private footer(): HTMLElement {
    const link = el('a', t('ranking.full'), 'ranking-side-full');
    link.href = '#communities?view=explore';
    return link;
  }
  private strip(): HTMLElement {
    const strip = el('div', '', 'ranking-side-strip');
    strip.append(this.toggle('«', 'ranking.expand', false));
    strip.append(el('div', '', 'ranking-side-faces'));
    return strip;
  }
  private paintStrip(rows: Row[]): void {
    const faces = this.host.querySelector<HTMLElement>('.ranking-side-faces');
    if (!faces) return;
    faces.replaceChildren(
      ...rows.slice(0, 8).map((row) => {
        const link = el('a', '', 'ranking-side-face');
        link.href = communityHref(row.community);
        link.title = row.community.name;
        link.append(communityAvatar(row.community.name));
        return link;
      }),
    );
  }
  private setCollapsed(value: boolean): void {
    this.host.dataset['collapsed'] = String(value);
    try {
      localStorage.setItem(collapsedKey, String(value));
    } catch {
      // The bar still collapses; only the memory across reloads is lost.
    }
  }
}

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(collapsedKey) === 'true';
  } catch {
    return false;
  }
}

function fillRow(node: HTMLElement, row: Row, rank: number, tab: RankingTab) {
  const [position, , copy, numbers] = [...node.children] as HTMLElement[];
  position!.textContent = String(rank);
  const topic = communityTopics.find(
    (entry) => entry.id === row.community.classification?.topics[0],
  );
  const detail = el(
    'small',
    topic ? t(topic.label) : row.community.description,
  );
  if (topic) detail.prepend(topicDot(topic.id));
  copy!.replaceChildren(el('strong', row.community.name), detail);
  const followers = new Intl.NumberFormat(currentLanguage(), {
    notation: 'compact',
  }).format(row.community.followers);
  const growth = el(
    'small',
    tab === 'following' ? '' : activeGrowth(row.participants, row.previous),
    'ranking-side-growth',
  );
  growth.dataset['trend'] =
    row.participants > row.previous
      ? 'up'
      : row.participants < row.previous
        ? 'down'
        : 'flat';
  numbers!.replaceChildren(
    el('strong', t('ranking.followers {0}', [followers])),
    growth,
  );
}
