import {
  currentLanguage,
  t,
  translatedError,
} from '../../shared/i18n/index.ts';
import { accountRankingPage } from '../../shared/account-ranking/index.ts';
import type { AccountRankingEntry } from '../../shared/account-ranking/index.ts';
import type { RankingPeriod } from '../../shared/community-ranking/index.ts';
import { communityRead } from './controller.ts';
import { communityElement as el } from './elements.ts';
import { communityAvatar } from './presentation.ts';
import { showPublicAvatar } from '../public-media/index.ts';
import { mentionPlainText } from '../../shared/public-mentions/index.ts';
import { growthLabel } from './ranking-side-growth.ts';

/** Windows offered by both rankings, labelled in the current language. */
export function rankingPeriods(): readonly (readonly [
  RankingPeriod,
  string,
])[] {
  return [
    ['day', t('24 hours')],
    ['week', t('7 days')],
    ['month', t('30 days')],
  ];
}

/** Owns account paging and media; community discovery only selects this panel. */
export class AccountRankingView {
  readonly element = el('section', '', 'account-ranking');
  private readonly list = el('ol', '', 'account-ranking-list');
  private readonly status = el('p', '', 'ranking-side-status');
  private readonly more = el('button', '', 'account-ranking-more');
  private period: RankingPeriod = 'day';
  private after: string | null = null;
  private generation = '';
  private busy = false;
  private offset = 0;
  private pageAfter: string | null = null;
  private pageOffset = 0;
  private pageLifetime = new AbortController();
  private epoch = 0;
  private lifetime: AbortController | null = null;
  private readonly signal: AbortSignal;
  constructor(signal: AbortSignal) {
    this.signal = signal;
    this.status.setAttribute('role', 'status');
    this.more.type = 'button';
    this.more.textContent = t('Next page');
    this.more.hidden = true;
    this.more.addEventListener('click', () => {
      void this.load(true);
    });
    const restart = el(
      'button',
      t('ranking.reload'),
      'account-ranking-restart',
    );
    restart.type = 'button';
    restart.addEventListener('click', () => {
      this.resetPage();
      void this.refresh();
    });
    this.element.append(this.list, this.status, this.more, restart);
    signal.addEventListener(
      'abort',
      () => {
        this.epoch++;
        this.pageLifetime.abort();
        this.lifetime?.abort();
      },
      { once: true },
    );
  }
  refresh(): Promise<void> {
    return this.load(false);
  }
  /** The period comes from whoever places the panel (sidebar menu or page buttons). */
  setPeriod(period: RankingPeriod): void {
    if (this.period === period) return;
    this.period = period;
    this.resetPage();
    void this.refresh();
  }
  private resetPage(): void {
    this.epoch++;
    this.after = null;
    this.generation = '';
    this.busy = false;
    this.pageLifetime.abort();
    this.pageLifetime = new AbortController();
    this.pageAfter = null;
    this.pageOffset = 0;
    this.lifetime?.abort();
    this.list.replaceChildren();
    this.offset = 0;
    this.more.hidden = true;
  }
  private async load(append: boolean): Promise<void> {
    if (this.busy || this.signal.aborted) return;
    this.busy = true;
    this.more.disabled = true;
    const epoch = this.epoch;
    try {
      const page = await this.readPage(append);
      if (!this.current(epoch)) return;
      const identity = JSON.stringify([page.generation, page.items, page.next]);
      if (!append && identity === this.generation) return;
      this.generation = identity;
      this.applyPage(page, append);
    } catch (error: unknown) {
      if (this.current(epoch)) {
        this.status.textContent =
          error instanceof Error
            ? translatedError(error.message)
            : t('ranking.unavailable');
        this.after = null;
        this.more.hidden = true;
      }
    } finally {
      if (epoch === this.epoch) {
        this.busy = false;
        this.more.disabled = false;
      }
    }
  }
  private async readPage(append: boolean) {
    const query = new URLSearchParams({ period: this.period });
    const after = append ? this.after : this.pageAfter;
    if (after) query.set('after', after);
    return accountRankingPage(
      await communityRead(
        `/api/communities/accounts?${query}`,
        AbortSignal.any([
          this.signal,
          this.pageLifetime.signal,
          AbortSignal.timeout(8000),
        ]),
      ),
    );
  }
  private applyPage(
    page: ReturnType<typeof accountRankingPage>,
    append: boolean,
  ): void {
    if (append) {
      this.pageAfter = this.after;
      this.pageOffset = this.offset;
    }
    this.render(page.items);

    this.after = page.next;
    this.more.hidden = !this.after;
    this.status.textContent = this.offset ? '' : t('ranking.empty');
  }
  private current(epoch: number): boolean {
    return epoch === this.epoch && !this.signal.aborted;
  }
  private render(items: AccountRankingEntry[]): void {
    this.lifetime?.abort();
    this.lifetime = new AbortController();
    this.list.replaceChildren();
    this.offset = this.pageOffset;
    const signal = AbortSignal.any([this.signal, this.lifetime.signal]);
    for (const item of items) {
      const row = el('li'),
        { link, avatar } = accountRow(item, ++this.offset);
      row.append(link);
      this.list.append(row);
      if (item.profile.avatar)
        showPublicAvatar(avatar, {
          kind: 'avatar',
          target: item.profile.id,
          reference: item.profile.avatar,
          signal,
        });
    }
  }
}
/**
 * FOMO-style row (19/10/2026): @nick with the bio below, like a ticker over
 * its price; followers on the right like a market cap, with the relevance
 * growth below them. The received counters stay in the row's tooltip.
 */
function accountRow(item: AccountRankingEntry, rank: number) {
  const link = el('a', '', 'account-ranking-row'),
    avatar = communityAvatar(item.profile.handle),
    copy = el('span', '', 'account-ranking-copy'),
    numbers = el('span', '', 'account-ranking-numbers');
  link.href = `#users?handle=${encodeURIComponent(item.profile.handle)}`;
  link.title = receivedSummary(item);
  avatar.classList.add('account-ranking-avatar');
  copy.append(el('strong', `@${item.profile.handle}`));
  // Plain text: the row is already a link, so mentions cannot be links here.
  const bio = mentionPlainText(item.description).replace(/\s+/gu, ' ');
  if (bio) copy.append(el('small', bio, 'account-ranking-bio'));
  const followers = new Intl.NumberFormat(currentLanguage(), {
    notation: 'compact',
  }).format(item.followers);
  numbers.append(
    el('strong', t('ranking.followers {0}', [followers])),
    growthLabel({
      participants: item.score,
      previous: item.previousScore,
      title: 'ranking.relevance-growth-title',
    }),
  );
  link.append(
    el('span', String(rank), 'ranking-side-rank'),
    avatar,
    copy,
    numbers,
  );
  return { link, avatar };
}
export function receivedSummary(item: {
  views: number;
  upvotes: number;
  comments: number;
  shares: number;
}): string {
  const format = new Intl.NumberFormat(currentLanguage(), {
    notation: 'compact',
  });
  return t(
    'ranking.received-summary {0} {1} {2} {3}',
    [item.views, item.upvotes, item.comments, item.shares].map((n) =>
      format.format(n),
    ),
  );
}

/** Reusable scope control; each panel keeps its own filters and resource lifetime. */
export function rankingScopes(
  host: HTMLElement,
  communities: HTMLElement,
  signal: AbortSignal,
) {
  const accounts = new AccountRankingView(signal),
    bar = el('nav', '', 'ranking-scopes');
  accounts.element.prepend(
    periodButtons((period) => accounts.setPeriod(period)),
  );
  bar.setAttribute('aria-label', t('ranking.scope'));
  accounts.element.hidden = true;
  let active = false;
  const buttons: HTMLButtonElement[] = [];
  for (const [isAccount, label] of [
    [false, 'ranking.title'],
    [true, 'ranking.users'],
  ] as const) {
    const button = el('button', t(label));
    button.type = 'button';
    button.setAttribute('aria-pressed', String(!isAccount));
    button.addEventListener('click', () => {
      active = isAccount;
      communities.hidden = active;
      accounts.element.hidden = !active;
      buttons.forEach((b, index) =>
        b.setAttribute('aria-pressed', String((index === 1) === active)),
      );
      if (active) void accounts.refresh();
    });
    buttons.push(button);
    bar.append(button);
  }
  host.append(bar, communities, accounts.element);
  return { active: () => active, refresh: () => accounts.refresh() };
}

function periodButtons(selected: (period: RankingPeriod) => void) {
  const periods = el('nav', '', 'ranking-periods'),
    buttons = new Map<RankingPeriod, HTMLButtonElement>();
  periods.setAttribute('aria-label', t('Period'));
  for (const [period, label] of rankingPeriods()) {
    const button = el('button', label);
    button.type = 'button';
    button.setAttribute('aria-pressed', String(period === 'day'));
    button.addEventListener('click', () => {
      for (const [value, node] of buttons)
        node.setAttribute('aria-pressed', String(value === period));
      selected(period);
    });
    periods.append(button);
    buttons.set(period, button);
  }
  return periods;
}

export function mountDiscoveryRanking(
  host: HTMLElement,
  view: string,
  signal: AbortSignal,
) {
  if (view !== 'explore') return { element: host, scope: null };
  const element = el('div', '', 'ranking-community-pane');
  return { element, scope: rankingScopes(host, element, signal) };
}
