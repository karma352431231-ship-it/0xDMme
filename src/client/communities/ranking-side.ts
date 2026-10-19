import { AccountRankingView, rankingPeriods } from './account-ranking.ts';
import { discoveryMenu } from './discovery-controls.ts';
import type { RankingPeriod } from '../../shared/community-ranking/index.ts';
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
import { growthLabel } from './ranking-side-growth.ts';

/**
 * FOMO-style ranking beside the feed (docs/UI_PAINEIS_E_TEMAS.md, 16/10/2026).
 * Public ranking pages are read without credentials; Following uses the
 * signed list. While visible, the bar refreshes every few seconds and redraws
 * only when the server published a new ranking, so likes, replies and posts
 * show up within seconds. Rows are reused per community, so photos are not
 * fetched again on every refresh.
 *
 * Controls take at most two rows (19/10/2026): the Communities | Users switch
 * with the collapse button, then the community orders. The period is the
 * header of the numbers column and serves both rankings. Beside the chat the
 * switch above the column picks the scope, so the first row is hidden there.
 */
export type RankingTab = 'trending' | 'size' | 'new' | 'following';
export type RankingScope = 'communities' | 'users';
type Row = {
  community: Community;
  participants: number;
  previous: number;
};

const refreshMs = 4000;
const collapsedKey = '0xdmme:ranking-side-collapsed';
const scopes: readonly [RankingScope, string][] = [
  ['communities', 'ranking.title'],
  ['users', 'ranking.users'],
];
const tabs: readonly [RankingTab, string][] = [
  ['trending', 'ranking.trending'],
  ['size', 'ranking.largest'],
  ['new', 'ranking.new'],
  ['following', 'ranking.following'],
];

export function startRankingSide(options: {
  shell: HTMLElement;
  access: VaultAccess;
  signedIn: () => boolean;
  /** The reader switched scope inside the sidebar. */
  scopeChanged?: (scope: RankingScope) => void;
}): {
  element: HTMLElement;
  refresh: () => void;
  showScope: (scope: RankingScope) => void;
} {
  const controller = new Communities(options.access);
  const aside = el('aside', '', 'ranking-side');
  aside.setAttribute('aria-label', t('ranking.overall'));
  const view = new RankingView(aside, {
    load: (tab, signal, period) =>
      load(controller, { tab, signal, period, signedIn: options.signedIn }),
    scopeChanged: (scope) => options.scopeChanged?.(scope),
  });
  options.shell.append(aside);
  const tick = () => {
    if (document.visibilityState === 'visible' && view.visible())
      void view.refresh();
  };
  setInterval(tick, refreshMs);
  document.addEventListener('visibilitychange', tick);
  return {
    element: aside,
    refresh: tick,
    showScope: (scope) => view.showScope(scope),
  };
}

async function load(
  controller: Communities,
  input: {
    tab: RankingTab;
    signal: AbortSignal;
    period: RankingPeriod;
    signedIn: () => boolean;
  },
): Promise<{ key: string; rows: Row[] } | null> {
  const { tab, signal, period, signedIn } = input;
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
      `/api/communities/explore?order=${tab}&period=${period}`,
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
  private period: RankingPeriod = 'day';
  private scope: RankingScope = 'communities';
  private readonly accounts: AccountRankingView;
  private key = '';
  private busy = false;
  private abort = new AbortController();
  private readonly rows = new Map<string, HTMLElement>();
  private readonly list: HTMLElement;
  private readonly status: HTMLElement;
  private readonly pane: HTMLElement;
  private readonly tabsRow: HTMLElement;
  private readonly columnLabel: HTMLElement;
  private readonly periodHost: HTMLElement;
  private readonly tabButtons = new Map<RankingTab, HTMLButtonElement>();
  private readonly scopeButtons = new Map<RankingScope, HTMLButtonElement>();
  private readonly host: HTMLElement;
  private readonly source: {
    load: (
      tab: RankingTab,
      signal: AbortSignal,
      period: RankingPeriod,
    ) => Promise<{ key: string; rows: Row[] } | null>;
    scopeChanged: (scope: RankingScope) => void;
  };
  constructor(host: HTMLElement, source: RankingView['source']) {
    this.host = host;
    this.source = source;
    this.list = el('div', '', 'ranking-side-list');
    this.status = el('p', '', 'ranking-side-status');
    this.status.setAttribute('role', 'status');
    this.columnLabel = el('span', t('ranking.community'));
    this.periodHost = el('div', '', 'ranking-side-period');
    this.tabsRow = this.tabBar();
    this.pane = el('div', '', 'ranking-community-pane');
    this.pane.append(this.list, this.status, this.footer());
    this.accounts = new AccountRankingView(this.abort.signal);
    this.accounts.element.hidden = true;
    host.append(
      this.header(),
      this.tabsRow,
      this.columns(),
      this.pane,
      this.accounts.element,
      this.strip(),
    );
    this.setCollapsed(readCollapsed());
  }
  /** Shows the community or the user ranking; the period is kept. */
  showScope(scope: RankingScope): void {
    if (scope === this.scope) return;
    this.scope = scope;
    for (const [id, button] of this.scopeButtons)
      button.setAttribute('aria-pressed', String(id === scope));
    const users = scope === 'users';
    this.pane.hidden = users;
    this.tabsRow.hidden = users;
    this.accounts.element.hidden = !users;
    this.columnLabel.textContent = t(
      users ? 'ranking.user' : 'ranking.community',
    );
    this.showPeriod();
    if (users) this.accounts.setPeriod(this.period);
    void this.refresh(true);
  }
  /** The list is on screen: not hidden by the layout nor collapsed. */
  visible(): boolean {
    return (
      this.host.offsetParent !== null &&
      this.host.dataset['collapsed'] !== 'true'
    );
  }
  async refresh(force = false): Promise<void> {
    if (this.scope === 'users') return this.accounts.refresh();
    if (this.busy && !force) return;
    this.busy = true;
    const tab = this.tab,
      period = this.period;
    try {
      const page = await this.source.load(tab, this.abort.signal, this.period);
      if (tab === this.tab && period === this.period) this.apply(page, force);
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
    this.showPeriod();
    this.list.replaceChildren();
    this.rows.clear();
    void this.refresh(true);
  }
  private header(): HTMLElement {
    const head = el('div', '', 'ranking-side-head');
    const track = el('div', '', 'ranking-side-scopes');
    track.setAttribute('role', 'group');
    track.setAttribute('aria-label', t('ranking.scope'));
    for (const [id, label] of scopes) {
      const button = el('button', t(label));
      button.type = 'button';
      button.setAttribute('aria-pressed', String(id === this.scope));
      button.addEventListener('click', () => {
        this.showScope(id);
        this.source.scopeChanged(id);
      });
      this.scopeButtons.set(id, button);
      track.append(button);
    }
    head.append(track, this.toggle('»', 'ranking.collapse', true));
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
  /** Column header: what is ranked, and the period its numbers cover. */
  private columns(): HTMLElement {
    const row = el('div', '', 'ranking-side-columns');
    discoveryMenu(
      this.periodHost,
      t('Período'),
      { value: this.period, options: rankingPeriods() },
      (value) => {
        this.period = value as RankingPeriod;
        this.key = '';
        // The hidden user ranking takes the period when it is shown.
        if (this.scope === 'users') this.accounts.setPeriod(this.period);
        else void this.refresh(true);
      },
    );
    row.append(this.columnLabel, this.periodHost);
    return row;
  }
  /** Following lists followed communities; no period applies to it. */
  private showPeriod(): void {
    this.periodHost.hidden =
      this.scope === 'communities' && this.tab === 'following';
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
  numbers!.replaceChildren(
    el('strong', t('ranking.followers {0}', [followers])),
    tab === 'following'
      ? el('small')
      : growthLabel({ ...row, title: 'ranking.growth-title' }),
  );
}
